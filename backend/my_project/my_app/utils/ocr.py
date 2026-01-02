"""
OCR utility functions using EasyOCR for text extraction from images and PDFs.
"""

import io
import logging
import os
import re
from pathlib import Path
from typing import Optional, Tuple, List
from PIL import Image, ImageEnhance, ImageFilter
import easyocr
import cv2
import numpy as np
from django.conf import settings

logger = logging.getLogger(__name__)

# Global EasyOCR reader instance (initialized once for performance)
_ocr_reader = None

def get_ocr_reader():
    """
    Get or initialize the EasyOCR reader instance.
    This is done globally to avoid reinitializing the model for each request.
    """
    global _ocr_reader
    if _ocr_reader is None:
        try:
            languages = getattr(settings, 'EASYOCR_LANGUAGES', ['en'])
            use_gpu = getattr(settings, 'EASYOCR_GPU', False)
            
            logger.info(f"Initializing EasyOCR with languages: {languages}, GPU: {use_gpu}")
            _ocr_reader = easyocr.Reader(languages, gpu=use_gpu)
            logger.info("EasyOCR reader initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize EasyOCR reader: {str(e)}")
            raise
    
    return _ocr_reader

# Supported file extensions
SUPPORTED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'}
SUPPORTED_PDF_EXTENSIONS = {'.pdf'}
ALL_SUPPORTED_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | SUPPORTED_PDF_EXTENSIONS

def preprocess_image_for_ocr(image: Image.Image) -> np.ndarray:
    """
    Preprocess image for better EasyOCR performance.
    
    Args:
        image: PIL Image object
        
    Returns:
        Preprocessed image as numpy array for EasyOCR
    """
    try:
        # Convert PIL image to OpenCV format (numpy array)
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to numpy array
        img_array = np.array(image)
        
        # Convert RGB to BGR for OpenCV
        img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Resize if image is too small (EasyOCR works better on larger images)
        height, width = img_array.shape[:2]
        if width < 640 or height < 640:
            scale_factor = max(640 / width, 640 / height)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            img_array = cv2.resize(img_array, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
            logger.info(f"Resized image from {width}x{height} to {new_width}x{new_height}")
        
        # Apply image enhancements for better OCR
        # Convert to grayscale for processing
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive histogram equalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(enhanced, (1, 1), 0)
        
        # Convert back to BGR for EasyOCR
        processed_img = cv2.cvtColor(blurred, cv2.COLOR_GRAY2BGR)
        
        return processed_img
        
    except Exception as e:
        logger.warning(f"Image preprocessing failed: {str(e)}. Using original image.")
        # Fallback: return original image as numpy array
        if image.mode != 'RGB':
            image = image.convert('RGB')
        img_array = np.array(image)
        return cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

def extract_text_with_easyocr(image_array: np.ndarray) -> Tuple[str, float]:
    """
    Extract text from image using EasyOCR with proper line breaks and positioning.
    
    Args:
        image_array: Preprocessed image as numpy array
        
    Returns:
        Tuple of (extracted_text, average_confidence)
    """
    try:
        reader = get_ocr_reader()
        
        # Extract text with EasyOCR
        results = reader.readtext(image_array)
        
        if not results:
            logger.warning("No text detected by EasyOCR")
            return "", 0.0
        
        # Process results with positioning
        text_blocks = []
        confidences = []
        
        for (bbox, text, confidence) in results:
            if confidence > 0.3:  # Filter out low-confidence detections
                # Extract bounding box coordinates
                # bbox is [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                top_left = bbox[0]
                bottom_right = bbox[2]
                
                # Calculate center position and dimensions
                x_center = (top_left[0] + bottom_right[0]) / 2
                y_center = (top_left[1] + bottom_right[1]) / 2
                width = abs(bottom_right[0] - top_left[0])
                height = abs(bottom_right[1] - top_left[1])
                
                text_blocks.append({
                    'text': text.strip(),
                    'confidence': confidence,
                    'x': x_center,
                    'y': y_center,
                    'width': width,
                    'height': height,
                    'bbox': bbox
                })
                confidences.append(confidence)
                logger.debug(f"Detected text: '{text}' at ({x_center:.0f}, {y_center:.0f}) with confidence: {confidence:.2f}")
        
        if not text_blocks:
            logger.warning("No text with sufficient confidence detected")
            return "", 0.0
        
        # Sort text blocks by vertical position (y-coordinate) first, then horizontal (x-coordinate)
        # This creates a reading order from top to bottom, left to right
        text_blocks.sort(key=lambda block: (block['y'], block['x']))
        
        # Group text blocks into lines based on vertical proximity
        lines = []
        current_line = []
        line_threshold = 20  # Pixels - adjust based on typical text height
        
        for block in text_blocks:
            if not current_line:
                current_line = [block]
            else:
                # Check if this block is on the same line as the previous ones
                avg_y = sum(b['y'] for b in current_line) / len(current_line)
                if abs(block['y'] - avg_y) <= line_threshold:
                    current_line.append(block)
                else:
                    # Start a new line
                    if current_line:
                        # Sort current line by x-coordinate (left to right)
                        current_line.sort(key=lambda b: b['x'])
                        lines.append(current_line)
                    current_line = [block]
        
        # Add the last line
        if current_line:
            current_line.sort(key=lambda b: b['x'])
            lines.append(current_line)
        
        # Construct the final text with proper line breaks
        final_lines = []
        for line in lines:
            line_text = ' '.join(block['text'] for block in line)
            final_lines.append(line_text.strip())
        
        # Join lines with newline characters
        full_text = '\n'.join(final_lines)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        logger.info(f"EasyOCR extracted {len(text_blocks)} text segments in {len(lines)} lines, avg confidence: {avg_confidence:.2f}")
        
        return full_text, avg_confidence
        
    except Exception as e:
        logger.error(f"EasyOCR text extraction failed: {str(e)}")
        return f"Error during OCR processing: {str(e)}", 0.0

def post_process_ocr_text(text: str) -> str:
    """
    Post-process OCR text to improve readability and fix common issues.
    
    Args:
        text: Raw OCR text
        
    Returns:
        Cleaned and processed text
    """
    if not text or not isinstance(text, str):
        return text
    
    logger.info("Applying OCR text post-processing")
    
    # Store original for comparison
    original_text = text
    
    # Step 1: Basic cleanup
    text = text.strip()
    
    # Step 2: Fix common spacing issues
    # Remove excessive spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Step 3: Fix common OCR errors
    # Fix common character substitutions
    text = re.sub(r'\b0\b', 'O', text)  # Zero to O in words
    text = re.sub(r'\bl\b', 'I', text)  # lowercase l to I when standalone
    
    # Step 4: Improve sentence structure
    # Ensure proper spacing after punctuation
    text = re.sub(r'([.!?])([A-Z])', r'\1 \2', text)
    text = re.sub(r'([,;:])([A-Za-z])', r'\1 \2', text)
    
    # Step 5: Fix line breaks and paragraphs
    # Normalize line breaks
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # Max double line breaks
    text = re.sub(r'[ \t]+\n', '\n', text)          # Remove trailing spaces
    text = re.sub(r'\n[ \t]+', '\n', text)          # Remove leading spaces after newlines
    
    # Final cleanup
    text = text.strip()
    
    # Log improvements
    if text != original_text:
        logger.info(f"OCR post-processing applied. Original length: {len(original_text)}, Processed length: {len(text)}")
    
    return text

def extract_text_with_positions(image_bytes: bytes) -> Tuple[dict, bool]:
    """
    Extract text from image with detailed positioning information.
    
    Args:
        image_bytes: Raw image bytes
        
    Returns:
        Tuple of (detailed_result_dict, success_flag)
    """
    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))
        logger.info(f"Processing image for detailed extraction: {image.size} pixels, mode: {image.mode}")
        
        # Preprocess image for EasyOCR
        processed_image = preprocess_image_for_ocr(image)
        
        # Get EasyOCR reader
        reader = get_ocr_reader()
        
        # Extract text with detailed results
        results = reader.readtext(processed_image)
        
        if not results:
            logger.warning("No text detected in image")
            return {
                "text": "",
                "lines": [],
                "blocks": [],
                "image_size": {"width": image.width, "height": image.height},
                "confidence": 0.0
            }, False
        
        # Process results with detailed positioning
        text_blocks = []
        confidences = []
        
        for (bbox, text, confidence) in results:
            if confidence > 0.3:  # Filter out low-confidence detections
                # Extract bounding box coordinates
                top_left = bbox[0]
                bottom_right = bbox[2]
                
                # Calculate position and dimensions
                x_center = (top_left[0] + bottom_right[0]) / 2
                y_center = (top_left[1] + bottom_right[1]) / 2
                width = abs(bottom_right[0] - top_left[0])
                height = abs(bottom_right[1] - top_left[1])
                
                text_blocks.append({
                    'text': text.strip(),
                    'confidence': confidence,
                    'position': {
                        'x': x_center,
                        'y': y_center,
                        'width': width,
                        'height': height
                    },
                    'bbox': {
                        'top_left': [top_left[0], top_left[1]],
                        'top_right': [bbox[1][0], bbox[1][1]],
                        'bottom_right': [bottom_right[0], bottom_right[1]],
                        'bottom_left': [bbox[3][0], bbox[3][1]]
                    }
                })
                confidences.append(confidence)
        
        # Sort and group into lines
        text_blocks.sort(key=lambda block: (block['position']['y'], block['position']['x']))
        
        lines = []
        current_line = []
        line_threshold = 20
        
        for block in text_blocks:
            if not current_line:
                current_line = [block]
            else:
                avg_y = sum(b['position']['y'] for b in current_line) / len(current_line)
                if abs(block['position']['y'] - avg_y) <= line_threshold:
                    current_line.append(block)
                else:
                    if current_line:
                        current_line.sort(key=lambda b: b['position']['x'])
                        lines.append(current_line)
                    current_line = [block]
        
        if current_line:
            current_line.sort(key=lambda b: b['position']['x'])
            lines.append(current_line)
        
        # Create line information
        line_info = []
        for i, line in enumerate(lines):
            line_text = ' '.join(block['text'] for block in line)
            line_bbox = {
                'min_x': min(block['bbox']['top_left'][0] for block in line),
                'min_y': min(block['bbox']['top_left'][1] for block in line),
                'max_x': max(block['bbox']['bottom_right'][0] for block in line),
                'max_y': max(block['bbox']['bottom_right'][1] for block in line)
            }
            line_info.append({
                'line_number': i + 1,
                'text': line_text.strip(),
                'blocks': line,
                'bbox': line_bbox,
                'confidence': sum(block['confidence'] for block in line) / len(line)
            })
        
        # Create final text
        full_text = '\n'.join(line['text'] for line in line_info)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        detailed_result = {
            "text": full_text,
            "lines": line_info,
            "blocks": text_blocks,
            "image_size": {"width": image.width, "height": image.height},
            "confidence": avg_confidence,
            "total_blocks": len(text_blocks),
            "total_lines": len(lines)
        }
        
        logger.info(f"Detailed extraction: {len(text_blocks)} blocks in {len(lines)} lines")
        
        return detailed_result, True
        
    except Exception as e:
        logger.error(f"Error in detailed text extraction: {str(e)}")
        return {
            "text": f"Error processing image: {str(e)}",
            "lines": [],
            "blocks": [],
            "image_size": {"width": 0, "height": 0},
            "confidence": 0.0
        }, False

def extract_text_from_image(image_bytes: bytes) -> Tuple[str, bool]:
    """
    Extract text from image bytes using EasyOCR.
    
    Args:
        image_bytes: Raw image bytes
        
    Returns:
        Tuple of (extracted_text, success_flag)
    """
    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))
        logger.info(f"Processing image: {image.size} pixels, mode: {image.mode}")
        
        # Preprocess image for EasyOCR
        processed_image = preprocess_image_for_ocr(image)
        
        # Extract text with EasyOCR
        raw_text, confidence = extract_text_with_easyocr(processed_image)
        
        if not raw_text.strip():
            logger.warning("No text extracted from image")
            return "No text could be extracted from the image.", False
        
        logger.info(f"Raw OCR result: {len(raw_text)} characters, confidence: {confidence:.2f}")
        
        # Apply post-processing
        processed_text = post_process_ocr_text(raw_text)
        
        logger.info(f"Post-processed OCR result: {len(processed_text)} characters")
        
        return processed_text, True
        
    except Exception as e:
        logger.error(f"Error extracting text from image: {str(e)}")
        return f"Error processing image: {str(e)}", False

def extract_text_from_pdf(pdf_bytes: bytes) -> Tuple[str, bool]:
    """
    Extract text from PDF bytes by converting to images and using EasyOCR.
    Creates TinyMCE-compatible multi-page HTML with page breaks.
    
    Args:
        pdf_bytes: Raw PDF bytes
        
    Returns:
        Tuple of (extracted_text_with_html, success_flag)
    """
    try:
        # Import pdf2image for PDF processing
        from pdf2image import convert_from_bytes
        import os
        
        logger.info("Converting PDF to images for OCR processing")
        
        # Try to add common Poppler installation paths to environment if not found
        poppler_paths = [
            r"C:\poppler\Library\bin",  # User's actual Poppler installation
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\bin"),
            r"C:\Program Files\poppler\bin",
            r"C:\Program Files (x86)\poppler\bin",
            os.path.expandvars(r"%USERPROFILE%\AppData\Local\Programs\Poppler\bin")
        ]
        
        current_path = os.environ.get('PATH', '')
        for poppler_path in poppler_paths:
            if os.path.exists(poppler_path) and poppler_path not in current_path:
                os.environ['PATH'] = f"{poppler_path};{current_path}"
                logger.info(f"Added Poppler path to environment: {poppler_path}")
                break
        
        # Convert PDF pages to images with enhanced settings
        try:
            images = convert_from_bytes(
                pdf_bytes,
                dpi=300,  # High DPI for better OCR accuracy
                first_page=1,
                last_page=20,  # Increased limit for more pages
                fmt='PNG',
                thread_count=2,  # Use multiple threads for faster processing
                grayscale=False,  # Keep color for better text detection
                transparent=False
            )
        except Exception as convert_error:
            logger.error(f"Error converting PDF to images: {str(convert_error)}")
            # Try alternative approach with lower DPI
            try:
                images = convert_from_bytes(
                    pdf_bytes,
                    dpi=200,  # Lower DPI as fallback
                    first_page=1,
                    last_page=10,
                    fmt='PNG'
                )
                logger.info("Fallback PDF conversion with lower DPI successful")
            except Exception as fallback_error:
                return f"Error processing PDF: {str(fallback_error)}", False
        
        if not images:
            return "No pages found in PDF.", False
        
        logger.info(f"Successfully converted PDF to {len(images)} images")
        
        # Process each page and create TinyMCE-compatible HTML
        page_contents = []
        
        for page_num, image in enumerate(images, 1):
            try:
                logger.info(f"Processing PDF page {page_num}/{len(images)}")
                
                # Convert PIL image to bytes for processing with high quality
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format='PNG', optimize=False, quality=95)
                img_bytes = img_byte_arr.getvalue()
                
                # Use the EXACT same OCR processing as Image OCR
                # Convert PIL image to proper format for EasyOCR (same as Image OCR)
                processed_image = preprocess_image_for_ocr(image)
                
                # Use the IDENTICAL function as Image OCR for positioning
                raw_text, confidence = extract_text_with_easyocr(processed_image)
                
                if raw_text.strip():
                    # Apply the same post-processing as Image OCR
                    processed_page_text = post_process_ocr_text(raw_text)
                    
                    if processed_page_text.strip():
                        page_contents.append(processed_page_text)
                        logger.info(f"Successfully processed PDF page {page_num} with positioning: {len(processed_page_text)} characters, confidence: {confidence:.2f}")
                    else:
                        logger.warning(f"No meaningful text found on page {page_num}")
                else:
                    logger.warning(f"Failed to extract text from PDF page {page_num}")
                    
            except Exception as e:
                logger.warning(f"Error processing PDF page {page_num}: {str(e)}")
                continue
        
        if not page_contents:
            return "No text could be extracted from any PDF pages.", False
        
        # Create natural text flow with clear page separations
        # Each PDF page should flow into TinyMCE naturally but with enough content
        # to trigger automatic page breaks when the content overflows
        
        # Join PDF pages with significant spacing to encourage natural page breaks
        # Multiple line breaks create enough content flow for TinyMCE page management
        page_separator = '\n\n\n\n'  # Extra spacing between PDF pages
        final_text = page_separator.join(page_contents)
        
        logger.info(f"Successfully created natural text flow from {len(page_contents)} PDF pages, {len(final_text)} total characters")
        
        return final_text, True
        
    except ImportError:
        logger.error("pdf2image not installed. PDF processing not available.")
        return "PDF processing requires pdf2image package. Please install it with: pip install pdf2image", False
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return f"Error processing PDF: {str(e)}", False

def extract_text_from_pdf_with_positions(pdf_bytes: bytes) -> Tuple[dict, bool]:
    """
    Extract text from PDF bytes with detailed positioning information for each page.
    Uses IDENTICAL logic as extract_text_with_positions but for PDF pages.
    
    Args:
        pdf_bytes: Raw PDF bytes
        
    Returns:
        Tuple of (detailed_result_dict, success_flag)
    """
    try:
        # Import pdf2image for PDF processing
        from pdf2image import convert_from_bytes
        import os
        
        logger.info("Converting PDF to images for detailed positioning OCR")
        
        # Try to add common Poppler installation paths to environment if not found
        poppler_paths = [
            r"C:\poppler\Library\bin",  # User's actual Poppler installation
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\bin"),
            r"C:\Program Files\poppler\bin",
            r"C:\Program Files (x86)\poppler\bin",
            os.path.expandvars(r"%USERPROFILE%\AppData\Local\Programs\Poppler\bin")
        ]
        
        current_path = os.environ.get('PATH', '')
        for poppler_path in poppler_paths:
            if os.path.exists(poppler_path) and poppler_path not in current_path:
                os.environ['PATH'] = f"{poppler_path};{current_path}"
                logger.info(f"Added Poppler path to environment: {poppler_path}")
                break
        
        # Convert PDF pages to images with enhanced settings
        try:
            images = convert_from_bytes(
                pdf_bytes,
                dpi=300,  # High DPI for better OCR accuracy
                first_page=1,
                last_page=20,  # Increased limit for more pages
                fmt='PNG',
                thread_count=2,  # Use multiple threads for faster processing
                grayscale=False,  # Keep color for better text detection
                transparent=False
            )
        except Exception as convert_error:
            logger.error(f"Error converting PDF to images: {str(convert_error)}")
            # Try alternative approach with lower DPI
            try:
                images = convert_from_bytes(
                    pdf_bytes,
                    dpi=200,  # Lower DPI as fallback
                    first_page=1,
                    last_page=10,
                    fmt='PNG'
                )
                logger.info("Fallback PDF conversion with lower DPI successful")
            except Exception as fallback_error:
                return {
                    "text": f"Error processing PDF: {str(fallback_error)}",
                    "lines": [],
                    "blocks": [],
                    "image_size": {"width": 0, "height": 0},
                    "confidence": 0.0,
                    "total_blocks": 0,
                    "total_lines": 0,
                    "pdf_pages": 0,
                    "pages": [],
                    "is_pdf": True,
                    "strict_pages": True
                }, False
        
        if not images:
            return {
                "text": "No pages found in PDF.",
                "lines": [],
                "blocks": [],
                "image_size": {"width": 0, "height": 0},
                "confidence": 0.0,
                "total_blocks": 0,
                "total_lines": 0,
                "pdf_pages": 0
            }, False
        
        logger.info(f"Successfully converted PDF to {len(images)} images for detailed positioning")
        
        # Process each PDF page as SEPARATE pages (not combined)
        pdf_pages_data = []
        all_texts = []
        all_confidences = []
        max_width = 0
        total_blocks = 0
        total_lines = 0
        
        for page_num, image in enumerate(images, 1):
            try:
                logger.info(f"Processing PDF page {page_num}/{len(images)} as separate page")
                
                # Convert PIL image to bytes for processing with high quality
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format='PNG', optimize=False, quality=95)
                img_bytes = img_byte_arr.getvalue()
                
                # Use EXACT same function as Image OCR for positioning
                page_result, page_success = extract_text_with_positions(img_bytes)
                
                if page_success and page_result.get('text', '').strip():
                    page_lines = page_result.get('lines', [])
                    page_blocks = page_result.get('blocks', [])
                    page_text = page_result.get('text', '')
                    page_confidence = page_result.get('confidence', 0.0)
                    page_size = page_result.get('image_size', {"width": 0, "height": 0})
                    
                    # Track statistics
                    max_width = max(max_width, page_size.get('width', 0))
                    total_blocks += len(page_blocks)
                    total_lines += len(page_lines)
                    
                    # Add page metadata to each element (keep original coordinates)
                    for block in page_blocks:
                        block['pdf_page'] = page_num
                    
                    for line in page_lines:
                        line['pdf_page'] = page_num
                    
                    # Store this page's complete data separately
                    pdf_pages_data.append({
                        "page_number": page_num,
                        "text": page_text,
                        "lines": page_lines,
                        "blocks": page_blocks,
                        "image_size": page_size,
                        "confidence": page_confidence,
                        "total_blocks": len(page_blocks),
                        "total_lines": len(page_lines)
                    })
                    
                    all_texts.append(page_text)
                    all_confidences.append(page_confidence)
                    
                    logger.info(f"PDF page {page_num} processed as separate page: {len(page_blocks)} blocks, {len(page_lines)} lines, confidence: {page_confidence:.2f}")
                    
                else:
                    # Create empty page for failed extractions to maintain page numbering
                    pdf_pages_data.append({
                        "page_number": page_num,
                        "text": "",
                        "lines": [],
                        "blocks": [],
                        "image_size": {"width": 0, "height": 0},
                        "confidence": 0.0,
                        "total_blocks": 0,
                        "total_lines": 0
                    })
                    logger.warning(f"Failed to extract text from PDF page {page_num} - created empty page")
                    
            except Exception as e:
                logger.warning(f"Error processing PDF page {page_num}: {str(e)}")
                # Create empty page for errors to maintain page numbering
                pdf_pages_data.append({
                    "page_number": page_num,
                    "text": f"Error processing page {page_num}: {str(e)}",
                    "lines": [],
                    "blocks": [],
                    "image_size": {"width": 0, "height": 0},
                    "confidence": 0.0,
                    "total_blocks": 0,
                    "total_lines": 0
                })
                continue
        
        if not pdf_pages_data:
            return {
                "text": "No text could be extracted from any PDF pages.",
                "lines": [],
                "blocks": [],
                "image_size": {"width": 0, "height": 0},
                "confidence": 0.0,
                "total_blocks": 0,
                "total_lines": 0,
                "pdf_pages": len(images),
                "pages": [],
                "is_pdf": True,
                "strict_pages": True
            }, False
        
        # Create simple combined text without visible page breaks (for backward compatibility only)
        page_separator = '\n\n\n\n'  # Invisible spacing - no visible text
        combined_text = page_separator.join(all_texts)
        
        # Calculate overall confidence
        avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
        
        # Create final detailed result with SEPARATE pages structure
        detailed_result = {
            "text": combined_text,
            "lines": [],  # Empty for PDF - use pages array instead
            "blocks": [],  # Empty for PDF - use pages array instead  
            "image_size": {"width": max_width, "height": 0},  # Combined width, no height stacking
            "confidence": avg_confidence,
            "total_blocks": total_blocks,
            "total_lines": total_lines,
            "pdf_pages": len(images),
            "pages": pdf_pages_data,  # Array of separate page data
            "is_pdf": True,  # Flag to indicate PDF source - disables overflow logic
            "strict_pages": True  # Flag to enforce 1:1 page correspondence
        }
        
        logger.info(f"PDF positioning OCR complete: {total_blocks} total blocks, {total_lines} total lines, {len(images)} pages, avg confidence: {avg_confidence:.2f}")
        
        return detailed_result, True
        
    except ImportError:
        logger.error("pdf2image not installed. PDF positioning processing not available.")
        return {
            "text": "PDF processing requires pdf2image package. Please install it with: pip install pdf2image",
            "lines": [],
            "blocks": [],
            "image_size": {"width": 0, "height": 0},
            "confidence": 0.0,
            "total_blocks": 0,
            "total_lines": 0,
            "pdf_pages": 0,
            "pages": [],
            "is_pdf": True,
            "strict_pages": True
        }, False
    except Exception as e:
        logger.error(f"Error in PDF positioning extraction: {str(e)}")
        return {
            "text": f"Error processing PDF with positioning: {str(e)}",
            "lines": [],
            "blocks": [],
            "image_size": {"width": 0, "height": 0},
            "confidence": 0.0,
            "total_blocks": 0,
            "total_lines": 0,
            "pdf_pages": 0,
            "pages": [],
            "is_pdf": True,
            "strict_pages": True
        }, False

def extract_text_from_file(file_bytes: bytes, filename: str) -> Tuple[str, bool]:
    """
    Extract text from uploaded file based on file extension.
    
    Args:
        file_bytes: Raw file bytes
        filename: Original filename with extension
        
    Returns:
        Tuple of (extracted_text, success_flag)
    """
    try:
        # Get file extension
        file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
        file_ext = f'.{file_ext}'
        
        # Validate file type
        if file_ext not in ALL_SUPPORTED_EXTENSIONS:
            supported = ', '.join(ALL_SUPPORTED_EXTENSIONS)
            return f"Unsupported file type. Supported formats: {supported}", False
        
        # Route to appropriate extraction function
        if file_ext in SUPPORTED_IMAGE_EXTENSIONS:
            return extract_text_from_image(file_bytes)
        elif file_ext in SUPPORTED_PDF_EXTENSIONS:
            return extract_text_from_pdf(file_bytes)
        else:
            return "Unsupported file type.", False
            
    except Exception as e:
        logger.error(f"Error in extract_text_from_file: {str(e)}")
        return f"Error processing file: {str(e)}", False

def validate_file_size(file_size: int, max_size_mb: int = 10) -> Tuple[bool, str]:
    """
    Validate uploaded file size.
    
    Args:
        file_size: File size in bytes
        max_size_mb: Maximum allowed size in MB
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    max_size_bytes = max_size_mb * 1024 * 1024
    
    if file_size > max_size_bytes:
        return False, f"File size ({file_size / (1024*1024):.1f}MB) exceeds maximum allowed size ({max_size_mb}MB)."
    
    return True, ""

def is_supported_file_type(filename: str) -> bool:
    """
    Check if the file type is supported for OCR.
    
    Args:
        filename: Original filename with extension
        
    Returns:
        True if supported, False otherwise
    """
    if not filename or '.' not in filename:
        return False
        
    file_ext = f".{filename.lower().split('.')[-1]}"
    return file_ext in ALL_SUPPORTED_EXTENSIONS

def get_supported_languages() -> List[str]:
    """
    Get list of supported languages for EasyOCR.
    
    Returns:
        List of supported language codes
    """
    try:
        # EasyOCR supported languages (as of version 1.7+)
        supported_languages = [
            'en', 'ch_sim', 'ch_tra', 'ja', 'ko', 'th', 'vi', 'ar', 'bg', 'cs', 'da', 'de', 
            'el', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'mt', 'nl', 
            'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sv', 'tr', 'uk', 'bn', 'gu', 
            'hi', 'kn', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'ta', 'te', 'ur', 'fa', 'he', 
            'my', 'ka', 'ky', 'mn', 'am', 'az', 'be', 'cy', 'eu', 'ga', 'gl', 'is', 'la', 
            'lb', 'mk', 'ms', 'sw', 'tl', 'yo', 'zu'
        ]
        return supported_languages
    except Exception as e:
        logger.error(f"Error getting supported languages: {str(e)}")
        return ['en']  # Default to English

def get_ocr_info() -> dict:
    """
    Get information about the OCR system.
    
    Returns:
        Dictionary with OCR system information
    """
    try:
        languages = getattr(settings, 'EASYOCR_LANGUAGES', ['en'])
        use_gpu = getattr(settings, 'EASYOCR_GPU', False)
        supported_langs = get_supported_languages()
        
        return {
            'ocr_engine': 'EasyOCR',
            'version': easyocr.__version__ if hasattr(easyocr, '__version__') else 'Unknown',
            'configured_languages': languages,
            'gpu_enabled': use_gpu,
            'supported_languages': supported_langs[:10],  # Show first 10 for brevity
            'total_supported_languages': len(supported_langs),
            'supported_image_formats': list(SUPPORTED_IMAGE_EXTENSIONS),
            'supported_document_formats': list(SUPPORTED_PDF_EXTENSIONS),
            'max_file_size_mb': 10
        }
    except Exception as e:
        logger.error(f"Error getting OCR info: {str(e)}")
        return {
            'ocr_engine': 'EasyOCR',
            'error': str(e),
            'configured_languages': ['en'],
            'gpu_enabled': False,
            'supported_image_formats': list(SUPPORTED_IMAGE_EXTENSIONS),
            'supported_document_formats': list(SUPPORTED_PDF_EXTENSIONS),
            'max_file_size_mb': 10
        } 