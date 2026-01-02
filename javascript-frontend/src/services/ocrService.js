/**
 * OCR Service for handling file uploads and text extraction
 * Communicates with Django OCR API backend
  */

  const API_BASE_URL = 'http://127.0.0.1:8000/api';

  /**
   * Upload file to OCR endpoint and extract text with positioning data
   * @param {File} file - The file to process (image or PDF)
   * @param {boolean} useDetailed - Whether to use detailed positioning endpoint
 * @returns {Promise<Object>} - OCR result with extracted text and positioning
 */
export const extractTextFromFile = async (file, useDetailed = true) => {
  try {
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Please upload PNG, JPEG, or PDF files.`);
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowed size (10MB).`);
    }

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);

    // Choose endpoint based on useDetailed flag
    const endpoint = useDetailed ? 'extract-detailed' : 'extract';
    
    // Make API request
    const response = await fetch(`${API_BASE_URL}/ocr/${endpoint}/`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser set it with boundary for FormData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // Handle unsuccessful OCR processing
    if (!result.success) {
      throw new Error(result.extracted_text || result.text || 'OCR processing failed');
    }

    return result;
  } catch (error) {
    console.error('OCR Service Error:', error);
    throw error;
  }
};

/**
 * Get OCR API information
 * @returns {Promise<Object>} - API capabilities and requirements
 */
export const getOcrInfo = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/ocr/info/`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('OCR Info Error:', error);
    throw error;
  }
};

/**
 * Format extracted text for TinyMCE editor
 * Handles escape sequences and converts to HTML format
 * @param {string} text - Raw extracted text
 * @returns {string} - HTML formatted text
 */
export const formatTextForEditor = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Handle various escape sequences and formatting
  let formattedText = text
    // Replace \n with <br> for line breaks
    .replace(/\\n/g, '<br>')
    .replace(/\n/g, '<br>')
    
    // Replace \t with non-breaking spaces for tabs
    .replace(/\\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    
    // Replace \r (carriage returns)
    .replace(/\\r/g, '')
    .replace(/\r/g, '')
    
    // Handle multiple spaces
    .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
    
    // Clean up any remaining escape sequences
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');

  // Wrap in paragraph tags for proper TinyMCE formatting
  // Split by double line breaks to create paragraphs
  const paragraphs = formattedText
    .split(/<br\s*\/?><br\s*\/?>/i)
    .filter(p => p.trim().length > 0)
    .map(p => `<p>${p.trim()}</p>`);

  return paragraphs.length > 0 ? paragraphs.join('') : `<p>${formattedText}</p>`;
};

/**
 * Convert OCR positioning data to TinyMCE-compatible HTML with editable positioning
 * @param {Object} ocrResult - OCR result with lines and positioning data
 * @returns {string} - HTML formatted text with flexible positioning for TinyMCE
 */
export const formatPositionedTextForEditor = (ocrResult) => {
  if (!ocrResult || !ocrResult.lines || ocrResult.lines.length === 0) {
    // Fallback to basic text formatting
    return formatTextForEditor(ocrResult?.text || '');
  }

  const { lines, image_size } = ocrResult;
  
  console.log('OCR Positioning Data:', {
    lines: lines.length,
    imageSize: image_size
  });

  // Group lines into logical paragraphs and sections based on positioning
  const sections = groupLinesIntoSections(lines);
  
  // Convert sections to editable HTML
  const htmlSections = sections.map(section => {
    return formatSectionAsEditableHTML(section);
  });

  return htmlSections.join('');
};

/**
 * Group OCR lines into logical sections based on positioning and spacing
 * @param {Array} lines - Array of OCR line objects
 * @returns {Array} - Array of section objects
 */
const groupLinesIntoSections = (lines) => {
  if (!lines || lines.length === 0) return [];

  const sections = [];
  let currentSection = {
    type: 'paragraph',
    lines: [],
    indentLevel: 0,
    spacing: 'normal'
  };

  lines.forEach((line, index) => {
    const bbox = line.bbox || {};
    const leftPosition = bbox.min_x || 0;
    const topPosition = bbox.min_y || 0;
    
    // Determine indent level based on left position
    const indentLevel = Math.floor(leftPosition / 50); // Every 50px is an indent level
    
    // Determine if this starts a new section
    let shouldStartNewSection = false;
    
    if (index > 0) {
      const prevLine = lines[index - 1];
      const prevBbox = prevLine.bbox || {};
      const verticalGap = topPosition - (prevBbox.max_y || 0);
      const indentChange = Math.abs(indentLevel - currentSection.indentLevel);
      
      // Start new section if:
      // 1. Large vertical gap (new paragraph)
      // 2. Significant indent change
      // 3. Line appears to be a header/title (isolated with spacing)
      shouldStartNewSection = verticalGap > 25 || indentChange > 0 || 
                             (verticalGap > 15 && line.text.length < 50);
    }
    
         if (shouldStartNewSection && currentSection.lines.length > 0) {
       sections.push(currentSection);
       const prevLine = lines[index - 1];
       const prevBbox = prevLine.bbox || {};
       const verticalGap = topPosition - (prevBbox.max_y || 0);
       
       currentSection = {
         type: determineContentType(line.text, indentLevel),
         lines: [],
         indentLevel: indentLevel,
         spacing: verticalGap > 40 ? 'large' : 'normal'
       };
     }
    
    currentSection.lines.push(line);
    currentSection.indentLevel = Math.max(currentSection.indentLevel, indentLevel);
  });
  
  // Add the last section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }
  
  return sections;
};

/**
 * Determine content type based on text content and positioning
 * @param {string} text - Line text
 * @param {number} indentLevel - Indentation level
 * @returns {string} - Content type
 */
const determineContentType = (text, indentLevel) => {
  // Check for headers (short lines, often followed by colons)
  if (text.length < 50 && (text.endsWith(':') || text.match(/^[A-Z][^.!?]*$/))) {
    return 'header';
  }
  
  // Check for list items
  if (text.match(/^[\-\*\•]\s/) || text.match(/^\d+[\.\)]\s/)) {
    return 'list-item';
  }
  
  // Check for indented content
  if (indentLevel > 0) {
    return 'indented';
  }
  
  return 'paragraph';
};

/**
 * Format a section as editable HTML while preserving visual structure
 * @param {Object} section - Section object with lines and metadata
 * @returns {string} - HTML string
 */
const formatSectionAsEditableHTML = (section) => {
  const { type, lines, indentLevel, spacing } = section;
  
  // Combine all text from lines in the section
  const sectionText = lines.map(line => line.text).join(' ');
  const avgConfidence = lines.reduce((sum, line) => sum + (line.confidence || 0), 0) / lines.length;
  
  // Calculate margins and indentation
  const topMargin = spacing === 'large' ? '1.5em' : '0.5em';
  const leftMargin = indentLevel * 2; // 2em per indent level
  
  // Generate appropriate HTML based on content type
  switch (type) {
    case 'header':
      return `<h3 style="margin-top: ${topMargin}; margin-bottom: 0.5em; margin-left: ${leftMargin}em; font-weight: bold; color: #2c3e50;" data-ocr-confidence="${avgConfidence.toFixed(2)}" data-ocr-type="header">${escapeHtml(sectionText)}</h3>`;
      
    case 'list-item':
      return `<ul style="margin-top: ${topMargin}; margin-left: ${leftMargin}em;">
        <li data-ocr-confidence="${avgConfidence.toFixed(2)}" data-ocr-type="list-item">${escapeHtml(sectionText.replace(/^[\-\*\•]\s*/, '').replace(/^\d+[\.\)]\s*/, ''))}</li>
      </ul>`;
      
    case 'indented':
      return `<div style="
        margin-top: ${topMargin}; 
        margin-left: ${leftMargin}em; 
        padding-left: 1em;
        border-left: 2px solid #e9ecef;
        background-color: rgba(0, 123, 255, 0.05);
      " data-ocr-confidence="${avgConfidence.toFixed(2)}" data-ocr-type="indented">
        <p style="margin: 0;">${escapeHtml(sectionText)}</p>
      </div>`;
      
    default: // paragraph
      return `<p style="margin-top: ${topMargin}; margin-bottom: 0.5em; margin-left: ${leftMargin}em; line-height: 1.6;" data-ocr-confidence="${avgConfidence.toFixed(2)}" data-ocr-type="paragraph">${escapeHtml(sectionText)}</p>`;
  }
};

/**
 * Create structured HTML for TinyMCE that preserves OCR positioning with editable flow
 * @param {Object} ocrResult - OCR result with positioning data
 * @returns {Object} - An object with 'type' ('full' or 'fragment') and 'html' string
 */
export const formatOCRForTinyMCE = (ocrResult) => {
  if (!ocrResult) {
    return { type: 'fragment', html: '<p>No OCR data available</p>' };
  }

  // Case 1: PDF result, which returns a full document structure.
  if (ocrResult.pages && Array.isArray(ocrResult.pages) && ocrResult.pages.length > 0) {
    console.log(`PDF result detected. Returning 'full' document HTML.`);
    return {
      type: 'full',
      html: formatPDFPagesForTinyMCE(ocrResult)
    };
  }
  
  // Case 2: Image result with positioned lines, which returns a content fragment.
  if (ocrResult.lines && ocrResult.lines.length > 0) {
    console.log(`Image result detected. Returning 'fragment' HTML.`);
    const positionedHtml = formatPositionedTextForEditor(ocrResult);
    // The wrapping div was causing the issue. The positionedHtml now returns valid <p> and <h3> tags.
    return { type: 'fragment', html: positionedHtml };
  } 
  
  // Case 3: Fallback for basic text, which is also a fragment.
  console.log('Fallback: basic text result. Returning "fragment" HTML.');
  const text = ocrResult.text || ocrResult.extracted_text || '';
  return { type: 'fragment', html: formatTextForEditor(text) };
};

/**
 * Format PDF pages for TinyMCE with STRICT 1:1 page correspondence
 * Each PDF page becomes exactly one TinyMCE page with NO overflow or merging
 * @param {Object} ocrResult - OCR result with pages array
 * @returns {string} - HTML formatted with fixed-height pages
 */
const formatPDFPagesForTinyMCE = (ocrResult) => {
  const pages = ocrResult.pages || [];
  
  if (pages.length === 0) {
    return '<p>No PDF pages found</p>';
  }

  console.log(`🔒 STRICT PDF MODE: Creating ${pages.length} FIXED pages - NO overflow allowed`);

  const pageHtmls = pages.map((pageData, index) => {
    const pageNumber = pageData.page_number || (index + 1);
    const pageLines = pageData.lines || [];
    const pageText = pageData.text || '';
    const confidence = pageData.confidence || 0;

    console.log(`📄 PDF Page ${pageNumber}: ${pageLines.length} lines - ISOLATED content`);

    // Use FULL positioning logic for each PDF page
    let pageContent;
    
    if (pageLines.length > 0) {
      // Create temporary OCR result for this page (same as Image OCR)
      const singlePageResult = {
        lines: pageLines,
        image_size: pageData.image_size || {"width": 0, "height": 0}
      };
      
      // Use full positioning logic
      pageContent = formatPositionedTextForEditor(singlePageResult);
    } else if (pageText.trim()) {
      // Fallback to basic formatting
      pageContent = formatTextForEditor(pageText);
    } else {
      // Empty page
      pageContent = `<p style="color: #999; font-style: italic;">Page ${pageNumber}: No content extracted</p>`;
    }

    // Add bottom padding to fill remaining space and prevent overflow to next page
    // This ensures content stays within its assigned PDF page
    const bottomPadding = `<div class="pdf-page-filler" style="height: auto; min-height: 200px; visibility: hidden;">
      <p><br></p><p><br></p><p><br></p><p><br></p><p><br></p>
      <p><br></p><p><br></p><p><br></p><p><br></p><p><br></p>
    </div>`;

    // Each PDF page becomes exactly ONE fixed TinyMCE page
    return `
      <div class="word-page pdf-strict-page" 
           data-pdf-page="${pageNumber}" 
           data-page-confidence="${confidence.toFixed(2)}"
           data-pdf-strict="true">
        <div class="word-page-content pdf-strict-content">
          ${pageContent}
          ${bottomPadding}
        </div>
      </div>
    `;
  });

  // Join all pages - no visible separators, just structural
  const allPagesHtml = pageHtmls.join('');
  
  return `
    <div class="pdf-strict-mode" 
         data-pdf-pages="${pages.length}" 
         data-pdf-mode="strict"
         data-ocr-confidence="${ocrResult.confidence?.toFixed(2) || '1.00'}" 
         data-total-blocks="${ocrResult.total_blocks || 0}">
      ${allPagesHtml}
    </div>
  `;
};

/**
 * Escape HTML characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
const escapeHtml = (text) => {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Check if file type is supported for OCR
 * @param {File} file - File to check
 * @returns {boolean} - Whether file type is supported
 */
export const isSupportedFileType = (file) => {
  const supportedTypes = [
    'image/png',
    'image/jpeg', 
    'image/jpg',
    'application/pdf'
  ];
  
  return supportedTypes.includes(file.type);
};

/**
 * Get human-readable file size
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}; 