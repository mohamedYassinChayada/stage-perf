"""
QR Code generation utilities for document management system.
"""

import qrcode
import os
from io import BytesIO
from PIL import Image
from django.core.files.base import ContentFile
from django.conf import settings
from ..models import QRLink
import logging

logger = logging.getLogger(__name__)

def generate_qr_code(data, filename=None, size=(300, 300), border=4):
    """
    Generate a QR code image from the given data.
    
    Args:
        data (str): The data to encode in the QR code
        filename (str, optional): The filename for the QR code image
        size (tuple): Size of the QR code image (width, height)
        border (int): Border size in boxes
        
    Returns:
        ContentFile: Django ContentFile object containing the QR code image
        
    Raises:
        Exception: If QR code generation fails
    """
    try:
        # Create QR code instance
        qr = qrcode.QRCode(
            version=1,  # Controls the size of the QR Code
            error_correction=qrcode.constants.ERROR_CORRECT_L,  # ~7% error correction
            box_size=10,  # Size of each box in pixels
            border=border,  # Border size in boxes
        )
        
        # Add data to QR code
        qr.add_data(data)
        qr.make(fit=True)
        
        # Create QR code image
        qr_image = qr.make_image(fill_color="black", back_color="white")
        
        # Resize if needed
        if size != qr_image.size:
            qr_image = qr_image.resize(size, Image.Resampling.LANCZOS)
        
        # Save to BytesIO
        buffer = BytesIO()
        qr_image.save(buffer, format='PNG')
        buffer.seek(0)
        
        # Create filename if not provided
        if not filename:
            filename = f"qrcode_{hash(data)}.png"
        elif not filename.endswith('.png'):
            filename += '.png'
        
        # Return as ContentFile
        return ContentFile(buffer.getvalue(), name=filename)
        
    except Exception as e:
        logger.error(f"Error generating QR code: {str(e)}")
        raise Exception(f"QR code generation failed: {str(e)}")

def generate_document_qr_code(document_id, base_url=None):
    """
    Generate a QR code for a specific document.
    
    Args:
        document_id (int): The ID of the document
        base_url (str, optional): Base URL for the application
        
    Returns:
        ContentFile: Django ContentFile object containing the QR code image
        
    Raises:
        Exception: If QR code generation fails
    """
    try:
        # Use provided base_url or get from settings
        if not base_url:
            base_url = getattr(settings, 'BASE_URL', 'http://localhost:8000')
        
        # Prefer QR resolve URL if a QRLink exists
        qr = QRLink.objects.filter(document_id=document_id, active=True).order_by('-created_at').first()
        if qr:
            document_url = f"{base_url}/api/qr/resolve/{qr.code}/"
        else:
            # Legacy direct document URL
            document_url = f"{base_url}/api/documents/{document_id}/"
        
        # Generate filename
        filename = f"document_{document_id}_qr.png"
        
        logger.info(f"Generating QR code for document {document_id} with URL: {document_url}")
        
        # Generate QR code
        qr_code_file = generate_qr_code(
            data=document_url,
            filename=filename,
            size=(300, 300),
            border=4
        )
        
        logger.info(f"Successfully generated QR code for document {document_id}")
        return qr_code_file
        
    except Exception as e:
        logger.error(f"Error generating QR code for document {document_id}: {str(e)}")
        raise Exception(f"Failed to generate QR code for document {document_id}: {str(e)}")

def update_document_qr_code(document):
    """
    Generate and save QR code for a document instance.
    
    Args:
        document: Document model instance
        
    Returns:
        bool: True if successful, False otherwise
        
    Raises:
        Exception: If QR code generation or saving fails
    """
    try:
        if not document.id:
            raise Exception("Document must be saved before generating QR code")
        
        logger.info(f"Updating QR code for document: {document.title} (ID: {document.id})")
        
        # Generate QR code
        qr_code_file = generate_document_qr_code(document.id)
        
        # Delete old QR code file if it exists
        if document.qr_code:
            try:
                if os.path.isfile(document.qr_code.path):
                    os.remove(document.qr_code.path)
                    logger.info(f"Deleted old QR code file for document {document.id}")
            except Exception as e:
                logger.warning(f"Could not delete old QR code file: {str(e)}")
        
        # Save new QR code
        document.qr_code.save(
            qr_code_file.name,
            qr_code_file,
            save=False  # Don't save the model yet, let the caller handle it
        )
        
        logger.info(f"Successfully updated QR code for document {document.id}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating QR code for document {document.id if document else 'unknown'}: {str(e)}")
        raise Exception(f"Failed to update QR code: {str(e)}")

def get_qr_code_info():
    """
    Get information about QR code generation capabilities.
    
    Returns:
        dict: Information about QR code generation
    """
    return {
        "qr_code_generator": "qrcode library",
        "supported_formats": ["PNG"],
        "default_size": "300x300 pixels",
        "error_correction": "Low (~7%)",
        "encoding": "UTF-8",
        "features": [
            "Document URL encoding",
            "Automatic filename generation", 
            "File cleanup on document deletion",
            "Customizable size and border",
            "PNG format output"
        ]
    }
