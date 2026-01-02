/**
 * This script helps manage Word-like page breaks in TinyMCE.
 * It detects when content exceeds page height and inserts page breaks automatically.
 */
//new comment in pageBreakDetection
// Page dimensions in pixels (approximately based on A4 dimensions)
const PAGE_HEIGHT_PX = 1056; // ~29.7cm at 96dpi
const PAGE_WIDTH_PX = 816;   // ~21cm at 96dpi
const PAGE_MARGINS_PX = 96;  // ~2.54cm at 96dpi

/**
 * Initialize page break detection for TinyMCE
 * @param {TinyMCE Editor} editor - The TinyMCE editor instance
 */
function initPageBreakDetection(editor) {
  let checkTimer = null;
    // Check if we need to add page breaks
  function checkPageBreaks() {
    const body = editor.getBody();
    const pages = body.querySelectorAll('.word-page');
    
    // If no pages exist, wrap content in a page
    if (pages.length === 0) {
      const content = body.innerHTML;
      body.innerHTML = `<div class="word-page" data-word-page="true">${content}</div>`;
      return;
    }
    
    // Check each page's content height
    pages.forEach(page => {
      const contentHeight = calculateContentHeight(page);
      const maxHeight = PAGE_HEIGHT_PX - (PAGE_MARGINS_PX * 2);
      
      // If content exceeds page height, find a good break point and split
      if (contentHeight > maxHeight) {
        splitPage(editor, page, maxHeight);
      }
    });
    
    // Clean up excessive empty paragraphs
    cleanupEmptyParagraphs(body);
    
    // Update page numbers
    updatePageNumbers(editor);
  }
  
  // Clean up excessive empty paragraphs
  function cleanupEmptyParagraphs(container) {
    const pages = container.querySelectorAll('.word-page');
    
    pages.forEach(page => {
      const paragraphs = page.querySelectorAll('p');
      let consecutiveEmptyCount = 0;
      const maxConsecutiveEmpty = 3; // Allow up to 3 consecutive empty paragraphs
      
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
    });
  }
  
  // Calculate total content height of a page
  function calculateContentHeight(page) {
    let height = 0;
    Array.from(page.children).forEach(child => {
      // Skip page number elements
      if (!child.classList.contains('word-page-number') && 
          !child.classList.contains('word-page-header') && 
          !child.classList.contains('word-page-footer')) {
        height += child.offsetHeight;
      }
    });
    return height;
  }
    // Split a page that's too long
  function splitPage(editor, page, maxHeight) {
    // Find a good break point (preferably paragraph)
    const children = Array.from(page.children);
    let currentHeight = 0;
    let breakIndex = -1;
    
    // Find the child element where we exceed the max height
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      // Skip non-content elements
      if (child.classList.contains('word-page-number') || 
          child.classList.contains('word-page-header') || 
          child.classList.contains('word-page-footer')) {
        continue;
      }
      
      currentHeight += child.offsetHeight;
      if (currentHeight > maxHeight) {
        breakIndex = i;
        break;
      }
    }
    
    // If we found a break point
    if (breakIndex > 0) {
      // Create a new page with proper Word-compatible structure
      const newPage = editor.getDoc().createElement('div');
      newPage.className = 'word-page';
      
      // Create a data attribute to help with Word export
      newPage.setAttribute('data-word-page', 'true');
      
      // Move content after break point to the new page
      const contentToMove = [];
      for (let i = children.length - 1; i >= breakIndex; i--) {
        const child = children[i];
        // Skip page elements
        if (child.classList.contains('word-page-number') || 
            child.classList.contains('word-page-header') || 
            child.classList.contains('word-page-footer')) {
          continue;
        }
        contentToMove.unshift(child);
        child.remove();
      }
      
      // Add content to new page
      contentToMove.forEach(child => {
        newPage.appendChild(child);
      });
      
      // Only create page break if we have content to move
      if (contentToMove.length > 0) {
        // Insert a proper page break element before the new page
        const pageBreak = editor.getDoc().createElement('div');
        pageBreak.className = 'page-break';
        // Add Word-compatibility attributes
        pageBreak.setAttribute('data-mce-word-pagebreak', 'true');
        pageBreak.innerHTML = '&nbsp;'; // Add minimal content
        
        // Insert the page break and new page
        page.parentNode.insertBefore(pageBreak, page.nextSibling);
        page.parentNode.insertBefore(newPage, pageBreak.nextSibling);
      }
    }
  }
    // Update page numbers on all pages
  function updatePageNumbers(editor) {
    const pages = editor.getDoc().querySelectorAll('.word-page');
    pages.forEach((page, index) => {
      let pageNumber = page.querySelector('.word-page-number');
      if (!pageNumber) {
        pageNumber = editor.getDoc().createElement('div');
        pageNumber.className = 'word-page-number';
        // Mark as non-content element for Word export
        pageNumber.setAttribute('data-mce-word-ignore', 'true');
        pageNumber.setAttribute('contenteditable', 'false');
        // Position it at the bottom of the page
        pageNumber.style.position = 'absolute';
        pageNumber.style.bottom = '1cm';
        pageNumber.style.left = '0';
        pageNumber.style.right = '0';
        pageNumber.style.textAlign = 'center';
        pageNumber.style.fontSize = '12px';
        pageNumber.style.color = '#777';
        pageNumber.style.zIndex = '1000';
        page.appendChild(pageNumber);
      }
      pageNumber.innerHTML = `Page ${index + 1} of ${pages.length}`;
    });
    
    // Trigger a custom event to notify about page count change
    const pageCountEvent = new CustomEvent('pageCountChanged', { 
      detail: { pageCount: pages.length } 
    });
    editor.getDoc().dispatchEvent(pageCountEvent);
  }
  
  // Listen for content changes
  editor.on('KeyUp', () => {
    // Debounce the check to avoid too many operations
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      checkPageBreaks();
    }, 500);
  });
  
  // Also check after paste events
  editor.on('PastePostProcess', () => {
    setTimeout(checkPageBreaks, 100);
  });
  
  // Initial check
  editor.on('init', () => {
    setTimeout(checkPageBreaks, 100);
  });
}

export default initPageBreakDetection;
