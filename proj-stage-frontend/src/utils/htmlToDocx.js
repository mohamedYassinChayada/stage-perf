/**
 * HTML to Word conversion utility using docx library
 * This provides better browser compatibility and proper DOCX generation
 */
//new comment in htmlToDocx.js
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, PageBreak, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Convert HTML content to Word document using docx library
 * @param {string} htmlContent - The HTML content to convert
 * @param {string} title - Document title
 * @param {Object} options - Conversion options
 * @returns {Promise<void>} Downloads the Word document
 */
export const htmlToDocx = async (htmlContent, title = 'Document', options = {}) => {
  try {
    console.log('Converting HTML to DOCX using docx library...');
    console.log('HTML Content length:', htmlContent?.length || 0);
    console.log('Title:', title);
    
    // Parse HTML content and convert to docx elements
    const docElements = parseHtmlToDocxElements(htmlContent);
    
    // Create the document
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              right: 1800, // 1.25 inches in twips
              bottom: 1440, // 1 inch in twips
              left: 1800, // 1.25 inches in twips
            },
          },
        },
        children: docElements,
      }],
    });

    // Generate and download the document
    const buffer = await Packer.toBlob(doc);
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
    saveAs(buffer, fileName);
    
    console.log('Word document created and downloaded successfully!');
    
  } catch (error) {
    console.error('Error converting HTML to Word:', error);
    throw new Error(`Failed to create Word document: ${error.message}`);
  }
};

/**
 * Parse HTML content and convert to docx elements
 * @param {string} htmlContent - The HTML content to parse
 * @returns {Array} Array of docx elements
 */
function parseHtmlToDocxElements(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [new Paragraph({ text: 'No content provided' })];
  }

  try {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Remove TinyMCE-specific elements
    const elementsToRemove = tempDiv.querySelectorAll(
      '.word-page-number, .word-page-header, .word-page-footer, .tox-, script, style[data-mce-bogus]'
    );
    elementsToRemove.forEach(el => el.remove());
    
    const docElements = [];
    
    // Check if we have word-page structure
    const pages = tempDiv.querySelectorAll('.word-page');
    
    if (pages.length > 0) {
      // Process each page separately
      pages.forEach((page, index) => {
        if (index > 0) {
          // Add page break before each page (except the first)
          docElements.push(new PageBreak());
        }
        
        // Process page content, filtering out excessive empty paragraphs
        const pageElements = processPageContent(page);
        docElements.push(...pageElements);
      });
    } else {
      // No page structure, process normally
      for (const node of tempDiv.childNodes) {
        const elements = processNode(node);
        docElements.push(...elements);
      }
    }
    
    return docElements.length > 0 ? docElements : [new Paragraph({ text: '' })];
    
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return [new Paragraph({ text: 'Error processing content' })];
  }
}

/**
 * Process page content and filter out excessive empty paragraphs
 * @param {Element} page - The page element to process
 * @returns {Array} Array of docx elements
 */
function processPageContent(page) {
  const docElements = [];
  let consecutiveEmptyParagraphs = 0;
  const maxConsecutiveEmptyParagraphs = 2; // Limit consecutive empty paragraphs
  
  for (const node of page.childNodes) {
    const elements = processNode(node);
    
    // Check if this is an empty paragraph by looking at the DOM node
    if (elements.length === 1 && elements[0].constructor.name === 'Paragraph') {
      const isEmptyParagraph = node.nodeType === Node.ELEMENT_NODE && 
                              node.tagName === 'P' && 
                              (!node.textContent.trim() || node.textContent.trim() === '\u00A0');
      
      if (isEmptyParagraph) {
        consecutiveEmptyParagraphs++;
        
        // Only add if we haven't exceeded the limit
        if (consecutiveEmptyParagraphs <= maxConsecutiveEmptyParagraphs) {
          docElements.push(...elements);
        }
      } else {
        consecutiveEmptyParagraphs = 0;
        docElements.push(...elements);
      }
    } else {
      consecutiveEmptyParagraphs = 0;
      docElements.push(...elements);
    }
  }
  
  return docElements;
}

/**
 * Process a DOM node and convert it to docx elements
 * @param {Node} node - The DOM node to process
 * @returns {Array} Array of docx elements
 */
function processNode(node) {
  const elements = [];
  
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text) {
      elements.push(new Paragraph({
        children: [new TextRun({ text })]
      }));
    }
    return elements;
  }
  
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return elements;
  }
  
  const element = node;
  const tagName = element.tagName?.toLowerCase();
  
  switch (tagName) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      elements.push(createHeading(element, tagName));
      break;
        case 'p':
      // Create paragraph and check if it has meaningful content
      const textContent = element.textContent?.trim();
      if (textContent && textContent !== '\u00A0') {
        // Has meaningful content
        elements.push(createParagraph(element));
      } else {
        // Empty paragraph - add it but it will be filtered later if excessive
        elements.push(new Paragraph({ text: '' }));
      }
      break;
      
    case 'div':
      // Skip page break divs - they're handled at the page level
      if (element.classList.contains('page-break') || 
          element.hasAttribute('data-mce-word-pagebreak')) {
        // Don't add page break here, it's handled by page processing
        break;
      }
      
      // Skip word-page divs - their content is processed directly
      if (element.classList.contains('word-page')) {
        for (const child of element.childNodes) {
          elements.push(...processNode(child));
        }
        break;
      }
      
      // For other divs, process children
      for (const child of element.childNodes) {
        elements.push(...processNode(child));
      }
      break;
      
    case 'ul':
    case 'ol':
      elements.push(...createList(element, tagName === 'ol'));
      break;
      
    case 'table':
      elements.push(createTable(element));
      break;
      
    case 'br':
      elements.push(new Paragraph({ text: '' }));
      break;
      
    case 'hr':
      elements.push(new Paragraph({
        children: [new TextRun({ text: '___________________________' })]
      }));
      break;
      
    default:
      // For other elements, process children
      for (const child of element.childNodes) {
        elements.push(...processNode(child));
      }
      break;
  }
  
  return elements;
}

/**
 * Create a heading paragraph
 * @param {Element} element - The heading element
 * @param {string} tagName - The heading tag name (h1, h2, etc.)
 * @returns {Paragraph} Heading paragraph
 */
function createHeading(element, tagName) {
  const headingLevels = {
    'h1': HeadingLevel.HEADING_1,
    'h2': HeadingLevel.HEADING_2,
    'h3': HeadingLevel.HEADING_3,
    'h4': HeadingLevel.HEADING_4,
    'h5': HeadingLevel.HEADING_5,
    'h6': HeadingLevel.HEADING_6,
  };
  
  const textRuns = createTextRuns(element);
  
  return new Paragraph({
    heading: headingLevels[tagName],
    children: textRuns,
  });
}

/**
 * Create a regular paragraph
 * @param {Element} element - The paragraph element
 * @returns {Paragraph} Paragraph
 */
function createParagraph(element) {
  const textRuns = createTextRuns(element);
  const alignment = getAlignment(element);
  
  return new Paragraph({
    children: textRuns,
    alignment: alignment,
  });
}

/**
 * Create text runs from an element, preserving formatting
 * @param {Element} element - The element to process
 * @returns {Array} Array of TextRun objects
 */
function createTextRuns(element) {
  const textRuns = [];
  
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text.trim()) {
        textRuns.push(new TextRun({
          text: text,
          ...getTextFormatting(element),
        }));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childElement = node;
      const childText = childElement.textContent;
      
      if (childText.trim()) {
        textRuns.push(new TextRun({
          text: childText,
          ...getTextFormatting(childElement, element),
        }));
      }
    }
  }
  
  // If no text runs created, create an empty one
  if (textRuns.length === 0) {
    textRuns.push(new TextRun({ text: element.textContent || '' }));
  }
  
  return textRuns;
}

/**
 * Get text formatting from element styles
 * @param {Element} element - The element to analyze
 * @param {Element} parentElement - The parent element (optional)
 * @returns {Object} Formatting options
 */
function getTextFormatting(element, parentElement = null) {
  const formatting = {};
  const style = element.style;
  
  // Check for bold
  if (element.tagName === 'STRONG' || element.tagName === 'B' || 
      style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700) {
    formatting.bold = true;
  }
  
  // Check for italic
  if (element.tagName === 'EM' || element.tagName === 'I' || 
      style.fontStyle === 'italic') {
    formatting.italics = true;
  }
  
  // Check for underline
  if (element.tagName === 'U' || style.textDecoration?.includes('underline')) {
    formatting.underline = {};
  }
  
  // Check for strikethrough
  if (element.tagName === 'S' || element.tagName === 'STRIKE' || 
      style.textDecoration?.includes('line-through')) {
    formatting.strike = true;
  }
  
  // Get color
  const color = style.color || (parentElement ? parentElement.style.color : '');
  if (color && color !== 'black' && color !== '#000000') {
    // Convert color to hex format for docx
    const hexColor = colorToHex(color);
    if (hexColor) {
      formatting.color = hexColor;
    }
  }
  
  // Get font size
  const fontSize = style.fontSize;
  if (fontSize) {
    const sizeInPt = parseFloat(fontSize);
    if (!isNaN(sizeInPt)) {
      formatting.size = Math.round(sizeInPt * 2); // Convert to half-points
    }
  }
  
  return formatting;
}

/**
 * Get paragraph alignment
 * @param {Element} element - The element to analyze
 * @returns {string} Alignment value
 */
function getAlignment(element) {
  const textAlign = element.style.textAlign;
  
  switch (textAlign) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
}

/**
 * Create a list from ul/ol element
 * @param {Element} element - The list element
 * @param {boolean} isOrdered - Whether it's an ordered list
 * @returns {Array} Array of paragraphs
 */
function createList(element, isOrdered = false) {
  const paragraphs = [];
  const listItems = element.querySelectorAll('li');
  
  listItems.forEach((li, index) => {
    const textRuns = createTextRuns(li);
    const bulletText = isOrdered ? `${index + 1}. ` : '• ';
    
    // Add bullet/number as first text run
    textRuns.unshift(new TextRun({ text: bulletText }));
    
    paragraphs.push(new Paragraph({
      children: textRuns,
      indent: {
        left: 720, // 0.5 inch indent
      },
    }));
  });
  
  return paragraphs;
}

/**
 * Create a table from table element
 * @param {Element} element - The table element
 * @returns {Table} Table object
 */
function createTable(element) {
  const rows = [];
  const tableRows = element.querySelectorAll('tr');
  
  tableRows.forEach(tr => {
    const cells = [];
    const tableCells = tr.querySelectorAll('td, th');
    
    tableCells.forEach(cell => {
      const textRuns = createTextRuns(cell);
      
      cells.push(new TableCell({
        children: [new Paragraph({ children: textRuns })],
        width: {
          size: 100 / tableCells.length,
          type: WidthType.PERCENTAGE,
        },
      }));
    });
    
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  });
  
  return new Table({
    rows: rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

/**
 * Convert color value to hex format
 * @param {string} color - Color value (rgb, rgba, named color, etc.)
 * @returns {string|null} Hex color without #
 */
function colorToHex(color) {
  try {
    // Create a temporary element to get computed color
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computedColor = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);
    
    // Parse rgb(r, g, b) format
    const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    // Return null for black or default colors
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Simple test function to verify the conversion is working
 * @returns {Promise<void>} Downloads a test document
 */
export const createTestDocument = async () => {
  try {
    const testHtml = `
      <h1 style="color: red;">Test Document</h1>
      <p style="color: blue; font-size: 14pt;">This is a <strong>bold</strong> and <em>italic</em> text with <u>underline</u>.</p>
      <p style="background-color: yellow;">This text has a yellow background.</p>
      <ul>
        <li>First bullet point</li>
        <li style="color: green;">Second bullet point in green</li>
        <li>Third bullet point</li>
      </ul>
      <ol>
        <li>First numbered item</li>
        <li style="color: purple;">Second numbered item in purple</li>
        <li>Third numbered item</li>
      </ol>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <tr>
          <th colspan="2" style="background-color: lightgray;">Merged Header</th>
        </tr>
        <tr>
          <td style="background-color: lightblue;">Cell 1</td>
          <td style="color: red; font-weight: bold;">Cell 2</td>
        </tr>
      </table>
      <p style="text-align: center; font-size: 16pt;">Centered large text</p>
      <hr>
      <p>Text after horizontal line</p>
    `;
    
    await htmlToDocx(testHtml, 'Test Document');
    console.log('Test document created successfully!');
  } catch (error) {
    console.error('Test document creation failed:', error);
    throw error;
  }
};

/**
 * Export content as clean HTML with proper page structure
 * @param {string} htmlContent - The HTML content to clean
 * @param {string} title - Document title
 * @returns {string} Clean HTML content
 */
export const exportAsCleanHtml = (htmlContent, title = 'Document') => {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Remove TinyMCE-specific elements
    const elementsToRemove = tempDiv.querySelectorAll(
      '.word-page-number, .word-page-header, .word-page-footer, .tox-, script, style[data-mce-bogus]'
    );
    elementsToRemove.forEach(el => el.remove());
    
    // Clean up excessive empty paragraphs
    const pages = tempDiv.querySelectorAll('.word-page');
    if (pages.length > 0) {
      pages.forEach(page => {
        cleanupEmptyParagraphs(page);
      });
    } else {
      cleanupEmptyParagraphs(tempDiv);
    }
    
    return tempDiv.innerHTML;
    
  } catch (error) {
    console.error('Error cleaning HTML:', error);
    return htmlContent;
  }
};

/**
 * Clean up excessive empty paragraphs in a container
 * @param {Element} container - The container element to clean
 */
function cleanupEmptyParagraphs(container) {
  const paragraphs = container.querySelectorAll('p');
  let consecutiveEmptyCount = 0;
  const maxConsecutiveEmpty = 2;
  
  paragraphs.forEach(p => {
    const textContent = p.textContent?.trim();
    const isEmpty = !textContent || textContent === '\u00A0';
    
    if (isEmpty) {
      consecutiveEmptyCount++;
      // Remove if we have too many consecutive empty paragraphs
      if (consecutiveEmptyCount > maxConsecutiveEmpty) {
        p.remove();
      }
    } else {
      consecutiveEmptyCount = 0;
    }
  });
}

/**
 * Export content as downloadable HTML file
 * @param {string} htmlContent - The HTML content to export
 * @param {string} title - Document title
 */
export const downloadAsHtml = (htmlContent, title = 'Document') => {
  const cleanHtml = exportAsCleanHtml(htmlContent, title);
  
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f0f0f0;
        }
        .word-page {
            background: white;
            padding: 1in;
            margin: 0 auto 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            width: 8.5in;
            min-height: 11in;
            position: relative;
            page-break-after: always;
        }
        .page-break {
            page-break-before: always;
        }
        @media print {
            body { background: white; }
            .word-page { 
                box-shadow: none; 
                margin: 0;
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    ${cleanHtml}
</body>
</html>`;
  
  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export content as PDF with proper page structure
 * @param {string} htmlContent - The HTML content to export
 * @param {string} title - Document title
 */
export const exportAsPdf = (htmlContent, title = 'Document') => {
  const cleanHtml = exportAsCleanHtml(htmlContent, title);
  
  // Create a new window for PDF generation
  const printWindow = window.open('', '_blank');
  
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @page {
            size: A4;
            margin: 1in;
        }
        
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background: white;
            color: black;
        }
        
        .word-page {
            background: white;
            padding: 0;
            margin: 0;
            width: 100%;
            min-height: calc(100vh - 2in);
            page-break-after: always;
            position: relative;
        }
        
        .word-page:last-child {
            page-break-after: avoid;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        /* Hide page numbers during print */
        .word-page-number {
            display: none;
        }
        
        p {
            margin: 0 0 12pt 0;
        }
        
        h1, h2, h3, h4, h5, h6 {
            margin: 12pt 0 6pt 0;
            page-break-after: avoid;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 12pt 0;
        }
        
        td, th {
            border: 1px solid black;
            padding: 6pt;
            text-align: left;
        }
        
        ul, ol {
            margin: 12pt 0;
            padding-left: 24pt;
        }
        
        /* Prevent page breaks inside elements */
        table, ul, ol {
            page-break-inside: avoid;
        }
        
        /* Ensure consistent spacing */
        * {
            box-sizing: border-box;
        }
    </style>
</head>
<body>
    ${cleanHtml}
    <script>
        // Auto-print when page loads
        window.onload = function() {
            window.print();
            setTimeout(() => {
                window.close();
            }, 1000);
        };
    </script>
</body>
</html>`;
  
  printWindow.document.write(fullHtml);
  printWindow.document.close();
};

/**
 * Import HTML content from file and prepare it for TinyMCE
 * @param {File} file - The HTML file to import
 * @returns {Promise<string>} Promise that resolves to the HTML content
 */
export const importFromHtml = async (file) => {
  try {
    if (!file || !file.type.includes('html')) {
      throw new Error('Please select a valid HTML file');
    }
    
    const htmlContent = await readFileContent(file);
    
    // Process the HTML content to make it TinyMCE-compatible
    const processedContent = processHtmlForTinyMCE(htmlContent);
    
    return processedContent;
    
  } catch (error) {
    console.error('Error importing HTML:', error);
    throw new Error(`Failed to import HTML file: ${error.message}`);
  }
};

/**
 * Read file content as text
 * @param {File} file - The file to read
 * @returns {Promise<string>} Promise that resolves to file content
 */
function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Process HTML content to make it compatible with TinyMCE
 * @param {string} htmlContent - The raw HTML content
 * @returns {string} Processed HTML content
 */
function processHtmlForTinyMCE(htmlContent) {
  try {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    
    // Extract body content if it's a full HTML document
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const contentToProcess = bodyMatch ? bodyMatch[1] : htmlContent;
    
    tempDiv.innerHTML = contentToProcess;
    
    // Ensure we have word-page structure
    const pages = tempDiv.querySelectorAll('.word-page');
    
    if (pages.length === 0) {
      // If no page structure exists, create one
      const content = tempDiv.innerHTML;
      tempDiv.innerHTML = `<div class="word-page" data-word-page="true">${content}</div>`;
    }
    
    // Add page numbers if they don't exist
    const pagesAfterProcessing = tempDiv.querySelectorAll('.word-page');
    pagesAfterProcessing.forEach((page, index) => {
      let pageNumber = page.querySelector('.word-page-number');
      if (!pageNumber) {
        pageNumber = document.createElement('div');
        pageNumber.className = 'word-page-number';
        pageNumber.setAttribute('data-mce-word-ignore', 'true');
        pageNumber.setAttribute('contenteditable', 'false');
        pageNumber.style.cssText = 'position: absolute; bottom: 1cm; left: 0px; right: 0px; text-align: center; font-size: 12px; color: #777777; z-index: 1000;';
        pageNumber.innerHTML = `Page ${index + 1} of ${pagesAfterProcessing.length}`;
        page.appendChild(pageNumber);
      }
    });
    
    // Ensure page breaks exist between pages
    const finalPages = tempDiv.querySelectorAll('.word-page');
    if (finalPages.length > 1) {
      // Add page breaks between pages if they don't exist
      for (let i = 0; i < finalPages.length - 1; i++) {
        const currentPage = finalPages[i];
        const nextPage = finalPages[i + 1];
        
        // Check if there's already a page break between them
        let hasPageBreak = false;
        let nextSibling = currentPage.nextSibling;
        
        while (nextSibling && nextSibling !== nextPage) {
          if (nextSibling.nodeType === Node.ELEMENT_NODE && 
              (nextSibling.classList?.contains('page-break') || 
               nextSibling.hasAttribute?.('data-mce-word-pagebreak'))) {
            hasPageBreak = true;
            break;
          }
          nextSibling = nextSibling.nextSibling;
        }
        
        if (!hasPageBreak) {
          const pageBreak = document.createElement('div');
          pageBreak.className = 'page-break';
          pageBreak.setAttribute('data-mce-word-pagebreak', 'true');
          pageBreak.innerHTML = '&nbsp;';
          currentPage.parentNode.insertBefore(pageBreak, nextPage);
        }
      }
    }
    
    return tempDiv.innerHTML;
    
  } catch (error) {
    console.error('Error processing HTML for TinyMCE:', error);
    return htmlContent;
  }
}

/**
 * Create a file input element for HTML import
 * @param {Function} callback - Callback function to handle the imported content
 * @returns {HTMLInputElement} File input element
 */
export const createHtmlImportInput = (callback) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.html,.htm';
  input.style.display = 'none';
  
  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const content = await importFromHtml(file);
        callback(content);
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import HTML file: ' + error.message);
      }
    }
  });
  
  return input;
};

/**
 * Trigger HTML file import dialog
 * @param {Function} callback - Callback function to handle the imported content
 */
export const triggerHtmlImport = (callback) => {
  const input = createHtmlImportInput(callback);
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
};

// Default export for compatibility
const htmlToDocxUtils = { 
  htmlToDocx, 
  createTestDocument, 
  exportAsCleanHtml, 
  downloadAsHtml,
  exportAsPdf,
  importFromHtml,
  createHtmlImportInput,
  triggerHtmlImport
};
export default htmlToDocxUtils;
