/**
 * Page break detection utility for Word-like page management in TinyMCE
 */

const PAGE_HEIGHT_PX = 1056;
const PAGE_WIDTH_PX = 816;
const PAGE_MARGINS_PX = 96;

interface TinyMCEEditorInstance {
  getBody(): HTMLElement;
  getDoc(): Document;
  on(event: string, callback: () => void): void;
}

/**
 * Initialize page break detection for TinyMCE
 */
function initPageBreakDetection(editor: TinyMCEEditorInstance): void {
  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  function checkPageBreaks(): void {
    const body = editor.getBody();
    const pages = body.querySelectorAll('.word-page');

    if (pages.length === 0) {
      const content = body.innerHTML;
      body.innerHTML = `<div class="word-page" data-word-page="true">${content}</div>`;
      return;
    }

    pages.forEach(page => {
      const contentHeight = calculateContentHeight(page);
      const maxHeight = PAGE_HEIGHT_PX - (PAGE_MARGINS_PX * 2);

      if (contentHeight > maxHeight) {
        splitPage(editor, page, maxHeight);
      }
    });

    cleanupEmptyParagraphs(body);
    updatePageNumbers(editor);
  }

  function cleanupEmptyParagraphs(container: HTMLElement): void {
    const pages = container.querySelectorAll('.word-page');

    pages.forEach(page => {
      const paragraphs = page.querySelectorAll('p');
      let consecutiveEmptyCount = 0;
      const maxConsecutiveEmpty = 3;

      paragraphs.forEach(p => {
        const textContent = p.textContent?.trim();
        const isEmpty = !textContent || textContent === '\u00A0';

        if (isEmpty) {
          consecutiveEmptyCount++;
          if (consecutiveEmptyCount > maxConsecutiveEmpty) {
            p.remove();
          }
        } else {
          consecutiveEmptyCount = 0;
        }
      });
    });
  }

  function calculateContentHeight(page: Element): number {
    let height = 0;
    Array.from(page.children).forEach(child => {
      if (!child.classList.contains('word-page-number') &&
        !child.classList.contains('word-page-header') &&
        !child.classList.contains('word-page-footer')) {
        height += (child as HTMLElement).offsetHeight;
      }
    });
    return height;
  }

  function splitPage(editor: TinyMCEEditorInstance, page: Element, maxHeight: number): void {
    const children = Array.from(page.children);
    let currentHeight = 0;
    let breakIndex = -1;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.classList.contains('word-page-number') ||
        child.classList.contains('word-page-header') ||
        child.classList.contains('word-page-footer')) {
        continue;
      }

      currentHeight += (child as HTMLElement).offsetHeight;
      if (currentHeight > maxHeight) {
        breakIndex = i;
        break;
      }
    }

    if (breakIndex > 0) {
      const newPage = editor.getDoc().createElement('div');
      newPage.className = 'word-page';
      newPage.setAttribute('data-word-page', 'true');

      const contentToMove: Element[] = [];
      for (let i = children.length - 1; i >= breakIndex; i--) {
        const child = children[i];
        if (child.classList.contains('word-page-number') ||
          child.classList.contains('word-page-header') ||
          child.classList.contains('word-page-footer')) {
          continue;
        }
        contentToMove.unshift(child);
        child.remove();
      }

      contentToMove.forEach(child => {
        newPage.appendChild(child);
      });

      if (contentToMove.length > 0) {
        const pageBreak = editor.getDoc().createElement('div');
        pageBreak.className = 'page-break';
        pageBreak.setAttribute('data-mce-word-pagebreak', 'true');
        pageBreak.innerHTML = '&nbsp;';

        page.parentNode?.insertBefore(pageBreak, page.nextSibling);
        page.parentNode?.insertBefore(newPage, pageBreak.nextSibling);
      }
    }
  }

  function updatePageNumbers(editor: TinyMCEEditorInstance): void {
    const pages = editor.getDoc().querySelectorAll('.word-page');
    pages.forEach((page, index) => {
      let pageNumber = page.querySelector('.word-page-number');
      if (!pageNumber) {
        pageNumber = editor.getDoc().createElement('div');
        pageNumber.className = 'word-page-number';
        pageNumber.setAttribute('data-mce-word-ignore', 'true');
        pageNumber.setAttribute('contenteditable', 'false');
        (pageNumber as HTMLElement).style.position = 'absolute';
        (pageNumber as HTMLElement).style.bottom = '1cm';
        (pageNumber as HTMLElement).style.left = '0';
        (pageNumber as HTMLElement).style.right = '0';
        (pageNumber as HTMLElement).style.textAlign = 'center';
        (pageNumber as HTMLElement).style.fontSize = '12px';
        (pageNumber as HTMLElement).style.color = '#777';
        (pageNumber as HTMLElement).style.zIndex = '1000';
        page.appendChild(pageNumber);
      }
      pageNumber.innerHTML = `Page ${index + 1} of ${pages.length}`;
    });

    const pageCountEvent = new CustomEvent('pageCountChanged', {
      detail: { pageCount: pages.length }
    });
    editor.getDoc().dispatchEvent(pageCountEvent);
  }

  editor.on('KeyUp', () => {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      checkPageBreaks();
    }, 500);
  });

  editor.on('PastePostProcess', () => {
    setTimeout(checkPageBreaks, 100);
  });

  editor.on('init', () => {
    setTimeout(checkPageBreaks, 100);
  });
}

export default initPageBreakDetection;
export { PAGE_HEIGHT_PX, PAGE_WIDTH_PX, PAGE_MARGINS_PX };
