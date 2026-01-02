import * as React from 'react';
import { saveAs } from 'file-saver';
import './WordLikeEditor.css';
import '../WordPageStyles.css';
import { htmlToDocx, triggerHtmlImport } from '../utils/htmlToDocx';

interface WordLikeEditorProps {
  qrCodeUrl?: string;
  initialTitle?: string;
  readOnly?: boolean;
}

export interface WordLikeEditorHandle {
  getEditor: () => TinyMCEEditor | null;
  getContent: () => string;
  setContent: (content: string) => void;
  focus: () => void;
  insertContent: (html: string) => void;
  getTitle: () => string;
  setTitle: (title: string) => void;
  reflow: (reason?: string) => void;
}

interface SelectionData {
  blockId: string;
  charOffset: number;
}

const WordLikeEditor = React.forwardRef<WordLikeEditorHandle, WordLikeEditorProps>(({ qrCodeUrl, ...props }, ref) => {
  const editorRef = React.useRef<TinyMCEEditor | null>(null);

  const [, setContent] = React.useState('');
  const [pageCount, setPageCount] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [documentTitle, setDocumentTitle] = React.useState(props.initialTitle || 'Untitled Document');

  const reflowDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReflowingRef = React.useRef(false);
  const blockIdCounterRef = React.useRef(0);
  const lastSelectionRef = React.useRef<SelectionData | null>(null);
  const selectionEpochRef = React.useRef(0);
  const reflowSelectionEpochRef = React.useRef(0);
  const recentReflowAtRef = React.useRef(0);
  const MIN_REFLOW_INTERVAL = 80;

  React.useEffect(() => {
    if (props.initialTitle) setDocumentTitle(props.initialTitle);
  }, [props.initialTitle]);

  const isBlockElement = (el: Element | null): boolean => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName;
    return /^(P|DIV|H[1-6]|UL|OL|TABLE|PRE|BLOCKQUOTE|IMG|OL)$/i.test(tag) || el.hasAttribute('data-page-break');
  };

  const assignBlockIdIfMissing = (el: Element | null): void => {
    if (el && !el.getAttribute('data-block-id')) {
      const id = 'blk-' + (++blockIdCounterRef.current);
      el.setAttribute('data-block-id', id);
    }
  };

  const getEnclosingBlock = (node: Node | null): Element | null => {
    let el: Element | null = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node?.parentElement || null);
    while (el && !isBlockElement(el)) el = el.parentElement;
    return el;
  };

  const getBlockText = (block: Element | null): string => block ? (block.textContent || '') : '';

  const saveSelection = (editor: TinyMCEEditor): SelectionData | null => {
    try {
      const rng = editor.selection.getRng();
      const startContainer = rng.startContainer;
      const block = getEnclosingBlock(startContainer);
      if (!block) return null;
      assignBlockIdIfMissing(block);

      const walker = editor.getDoc().createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      let charCount = 0;
      let found = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node === startContainer) {
          charCount += rng.startOffset;
          found = true;
          break;
        } else {
          charCount += (node.textContent?.length || 0);
        }
      }
      if (!found && startContainer.nodeType === Node.ELEMENT_NODE) {
        charCount = Math.min(charCount, getBlockText(block).length);
      }
      const sel: SelectionData = { blockId: block.getAttribute('data-block-id') || '', charOffset: charCount };
      lastSelectionRef.current = sel;
      return sel;
    } catch {
      return null;
    }
  };

  const findLastTextNode = (root: Node, doc: Document): Text | null => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let last: Text | null = null;
    while (walker.nextNode()) last = walker.currentNode as Text;
    return last;
  };

  const restoreSelection = (editor: TinyMCEEditor, selData: SelectionData | null): void => {
    if (!selData) return;
    if (selectionEpochRef.current !== reflowSelectionEpochRef.current) {
      return;
    }
    try {
      const doc = editor.getDoc();
      const block = doc.querySelector(`[data-block-id="${selData.blockId}"]`);
      if (!block) return;
      const offset = Math.min(selData.charOffset, getBlockText(block).length);
      let remaining = offset;
      const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      let targetNode: Text | null = null;
      let offsetInNode = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const len = node.textContent?.length || 0;
        if (remaining <= len) {
          targetNode = node;
          offsetInNode = remaining;
          break;
        }
        remaining -= len;
      }
      if (!targetNode) {
        const last = findLastTextNode(block, doc);
        if (last) {
          targetNode = last;
          offsetInNode = last.textContent?.length || 0;
        } else {
          editor.selection.setCursorLocation(block, block.childNodes.length);
          return;
        }
      }
      const rng = doc.createRange();
      rng.setStart(targetNode, offsetInNode);
      rng.setEnd(targetNode, offsetInNode);
      editor.selection.setRng(rng);
    } catch {
      // ignore
    }
  };

  const insertCaretMarker = (editor: TinyMCEEditor): string | null => {
    try {
      const doc = editor.getDoc();
      const rng = editor.selection.getRng();
      const marker = doc.createElement('span');
      const id = 'caret-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      marker.id = id;
      marker.setAttribute('data-caret-marker', 'true');
      marker.style.display = 'inline-block';
      marker.style.width = '0';
      marker.style.height = '0';
      marker.style.overflow = 'hidden';
      marker.style.lineHeight = '0';
      marker.appendChild(doc.createTextNode('\u200B'));
      rng.insertNode(marker);
      const after = doc.createRange();
      after.setStartAfter(marker);
      after.setEndAfter(marker);
      editor.selection.setRng(after);
      return id;
    } catch {
      return null;
    }
  };

  const restoreSelectionByMarker = (editor: TinyMCEEditor, id: string | null): boolean => {
    if (!id) return false;
    try {
      const doc = editor.getDoc();
      const marker = doc.getElementById(id);
      if (!marker) return false;
      const rng = doc.createRange();
      rng.setStartAfter(marker);
      rng.setEndAfter(marker);
      editor.selection.setRng(rng);
      marker.parentNode?.removeChild(marker);
      return true;
    } catch {
      return false;
    }
  };

  const createEmptyPage = (doc: Document, pageNumber: number): HTMLElement => {
    const page = doc.createElement('div');
    page.className = 'word-page';
    page.setAttribute('data-page', String(pageNumber));
    const content = doc.createElement('div');
    content.className = 'word-page-content';
    content.setAttribute('data-content-integrity', 'protected');
    const p = doc.createElement('p');
    p.innerHTML = '<br>';
    p.setAttribute('data-content-protected', 'true');
    assignBlockIdIfMissing(p);
    content.appendChild(p);
    page.appendChild(content);
    return page;
  };

  const createPageBreakSentinel = (doc: Document): HTMLElement => {
    const brk = doc.createElement('div');
    brk.setAttribute('data-page-break', 'true');
    brk.setAttribute('contenteditable', 'false');
    brk.style.borderTop = '1px dashed #ccc';
    brk.style.margin = '8px 0';
    brk.style.height = '0';
    brk.style.fontSize = '0';
    brk.style.lineHeight = '0';
    brk.innerHTML = '&#8203;';
    assignBlockIdIfMissing(brk);
    return brk;
  };

  const updatePageNumbers = (editor: TinyMCEEditor): void => {
    const doc = editor.getDoc();
    const pages = doc.querySelectorAll('.word-page');
    pages.forEach((p: Element, i: number) => p.setAttribute('data-page', String(i + 1)));
    setPageCount(pages.length);
    editor.fire('PageCountChanged');
  };

  const reflowDocument = (reason: string = 'unknown', caretMarkerId: string | null = null): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const now = performance.now();
    if (isReflowingRef.current) return;
    if (now - recentReflowAtRef.current < MIN_REFLOW_INTERVAL && reason === 'typing') {
      return;
    }

    const body = editor.getBody();
    if (!body) return;
    if (body.querySelector('.pdf-strict-mode') || (body as Element).closest?.('.pdf-strict-mode')) return;

    isReflowingRef.current = true;
    reflowSelectionEpochRef.current = selectionEpochRef.current;
    const selData = !caretMarkerId ? saveSelection(editor) : null;

    try {
      const doc = editor.getDoc();
      let existingPages = Array.from(doc.querySelectorAll('.word-page'));
      if (existingPages.length === 0) {
        body.appendChild(createEmptyPage(doc, 1));
        existingPages = Array.from(doc.querySelectorAll('.word-page'));
      }

      const firstContent = body.querySelector('.word-page .word-page-content');
      if (!firstContent) {
        body.appendChild(createEmptyPage(doc, 1));
      }
      let pageHeightPx = firstContent?.clientHeight || 1000;
      if (pageHeightPx < 100) {
        pageHeightPx = 1000;
      }

      const allBlocks: Element[] = [];
      existingPages.forEach((pg: Element) => {
        const c = pg.querySelector('.word-page-content');
        if (!c) return;
        Array.from(c.children).forEach((ch: Element) => {
          if (ch.hasAttribute('data-page-break') || isBlockElement(ch)) {
            assignBlockIdIfMissing(ch);
            allBlocks.push(ch);
          } else if (ch.nodeType === 1 && ch.textContent?.trim()) {
            const newP = doc.createElement('p');
            newP.innerHTML = (ch as HTMLElement).innerHTML;
            assignBlockIdIfMissing(newP);
            allBlocks.push(newP);
          }
        });
      });

      existingPages.forEach((el: Element) => el.remove());

      if (allBlocks.length === 0) {
        body.appendChild(createEmptyPage(doc, 1));
        updatePageNumbers(editor);
        if (!caretMarkerId) restoreSelection(editor, selData);
        else restoreSelectionByMarker(editor, caretMarkerId);
        return;
      }

      let currentPageNumber = 0;
      let currentPageEl: HTMLElement | null = null;
      let currentPageContent: HTMLElement | null = null;

      const startNewPage = (): void => {
        currentPageNumber++;
        currentPageEl = createEmptyPage(doc, currentPageNumber);
        currentPageContent = currentPageEl.querySelector('.word-page-content');
        if (currentPageContent &&
          currentPageContent.children.length === 1 &&
          currentPageContent.children[0].textContent?.trim() === '') {
          currentPageContent.innerHTML = '';
        }
        body.appendChild(currentPageEl);
      };
      startNewPage();

      allBlocks.forEach(block => {
        if (block.hasAttribute('data-page-break')) {
          if (currentPageContent && currentPageContent.children.length > 0) {
            startNewPage();
          }
          return;
        }
        if (!currentPageContent) startNewPage();
        currentPageContent!.appendChild(block);
        const overflow = currentPageContent!.scrollHeight - currentPageContent!.clientHeight;
        if (overflow > 0) {
          if (currentPageContent!.children.length === 1) {
            // oversize block accepted
          } else {
            currentPageContent!.removeChild(block);
            startNewPage();
            currentPageContent!.appendChild(block);
          }
        }
      });

      const finals = Array.from(doc.querySelectorAll('.word-page'));
      finals.forEach((pg: Element) => {
        const c = pg.querySelector('.word-page-content');
        if (finals.length > 1 && c && c.children.length === 0) pg.remove();
      });

      updatePageNumbers(editor);

      if (!restoreSelectionByMarker(editor, caretMarkerId)) {
        restoreSelection(editor, selData);
      }
    } catch (e) {
      console.error('[Reflow] ERROR:', e);
    } finally {
      recentReflowAtRef.current = performance.now();
      isReflowingRef.current = false;
    }
  };

  const scheduleReflow = (reason: string = 'debounced', delay: number = 150): void => {
    if (reflowDebounceRef.current) clearTimeout(reflowDebounceRef.current);
    reflowDebounceRef.current = setTimeout(() => {
      const editor = editorRef.current;
      const markerId = editor ? insertCaretMarker(editor) : null;
      reflowDocument(reason, markerId);
    }, delay);
  };

  const pageContentOfNode = (node: Node | null): Element | null => {
    if (!node) return null;
    return (node as Element).closest?.('.word-page-content') || null;
  };

  const shouldTriggerTypingReflow = (editor: TinyMCEEditor): boolean => {
    const node = editor.selection?.getNode();
    if (!node) return false;
    const pageContent = pageContentOfNode(node);
    if (!pageContent) return false;
    const overflow = (pageContent as HTMLElement).scrollHeight - (pageContent as HTMLElement).clientHeight;
    return overflow > 0;
  };

  const cleanContentForPageManagement = (content: string): string => {
    if (!content) return content;
    const isPlainText = !content.includes('<') || !content.includes('>');
    if (isPlainText) return content;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    tempDiv.querySelectorAll('.page-break, [class*="page-break"]').forEach(el => el.remove());
    tempDiv.querySelectorAll('.page-indicator, .page-count, .word-page-number, [class*="page-indicator"], [class*="page-count"]').forEach(el => el.remove());
    tempDiv.querySelectorAll('*').forEach(el => {
      if (el.textContent && /Page\s+\d+\s+of\s+\d+/i.test(el.textContent)) el.remove();
    });
    tempDiv.querySelectorAll('p').forEach(p => {
      if (!p.innerHTML.trim()) p.innerHTML = '<br>';
      p.setAttribute('data-content-protected', 'true');
    });
    const existingPages = tempDiv.querySelectorAll('.word-page');
    if (existingPages.length === 0 && tempDiv.innerHTML.trim()) {
      const inner = tempDiv.innerHTML.trim();
      tempDiv.innerHTML = `
        <div class="word-page" data-page="1">
          <div class="word-page-content">
            ${inner}
          </div>
        </div>
      `;
    } else {
      existingPages.forEach((page, idx) => {
        page.setAttribute('data-page', String(idx + 1));
        page.querySelectorAll('.word-page-number').forEach(n => n.remove());
        let container = page.querySelector('.word-page-content');
        if (!container) {
          container = document.createElement('div');
          container.className = 'word-page-content';
          while (page.firstChild && page.firstChild !== container) {
            container.appendChild(page.firstChild);
          }
          page.appendChild(container);
        }
        if (!container.innerHTML.trim()) {
          container.innerHTML = '<p data-content-protected="true"><br></p>';
        }
      });
    }
    return tempDiv.innerHTML;
  };

  const setContentWithPageManagement = (content: string): void => {
    if (!editorRef.current) return;
    const cleaned = cleanContentForPageManagement(content);
    editorRef.current.setContent(cleaned);
  };

  const cleanContentForExport = (content: string): string => {
    const d = document.createElement('div');
    d.innerHTML = content;
    d.querySelectorAll('.page-break, [class*="page-break"]').forEach(el => el.remove());
    d.querySelectorAll('.page-indicator, .page-count, .word-page-number, [class*="page-indicator"], [class*="page-count"]').forEach(el => el.remove());
    d.querySelectorAll('*').forEach(el => {
      if (el.textContent && /Page\s+\d+\s+of\s+\d+/i.test(el.textContent)) el.remove();
    });
    d.querySelectorAll('p:empty, div:empty').forEach(el => {
      if (!el.innerHTML.trim() && !el.querySelector('br')) el.remove();
    });
    return d.innerHTML;
  };

  const printWithQRWatermark = (): void => {
    if (!editorRef.current) return;
    if (!qrCodeUrl) {
      alert('QR Code URL is not available for this document.');
      return;
    }

    const rawContent = editorRef.current.getContent();
    const content = cleanContentForExport(rawContent);
    const w = window.open('', '_blank');

    if (w) {
      w.document.write(`
        <!DOCTYPE html>
        <html><head><title>${documentTitle}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Calibri', Arial, sans-serif; -webkit-print-color-adjust: exact; color-adjust: exact; }
          .word-page {
            width: 210mm;
            height: 296mm;
            padding: 20mm;
            position: relative;
            break-after: page;
            display: block;
            page-break-inside: avoid;
          }
          .word-page:last-of-type { break-after: auto; }
          .qr-watermark {
            position: absolute;
            top: 5mm;
            left: 5mm;
            width: 35mm;
            height: 35mm;
            opacity: 0.15;
            z-index: 0;
            background-image: url('${qrCodeUrl}');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }
        </style>
        </head>
        <body>
          ${content.replace(/<div class="word-page"/g, '<div class="word-page"><div class="qr-watermark"></div>')}
        </body></html>
      `);
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
        w.close();
      }, 1000);
    }
  };

  const printDocument = (): void => {
    if (!editorRef.current) return;
    const rawContent = editorRef.current.getContent();
    const content = cleanContentForExport(rawContent);
    const w = window.open('', '_blank');

    if (w) {
      w.document.write(`
        <!DOCTYPE html>
        <html><head><title>${documentTitle}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Calibri', Arial, sans-serif; -webkit-print-color-adjust: exact; color-adjust: exact; }
          .word-page {
            width: 210mm;
            height: 296mm;
            padding: 20mm;
            position: relative;
            break-after: page;
            display: block;
            page-break-inside: avoid;
          }
          .word-page:last-of-type { break-after: auto; }
        </style>
        </head><body>${content}</body></html>
      `);
      w.document.close();
      setTimeout(() => { w.print(); w.close(); }, 500);
    }
  };

  const saveDocument = (): void => {
    if (!editorRef.current) return;
    const raw = editorRef.current.getContent();
    const cleaned = cleanContentForExport(raw);
    const blob = new Blob([cleaned], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const preprocessContentForWordExport = (content: string): string => {
    const d = document.createElement('div');
    d.innerHTML = content;
    const pages = d.querySelectorAll('.word-page');
    pages.forEach((page, idx) => {
      (page as HTMLElement).style.position = '';
      (page as HTMLElement).style.minHeight = '';
      if (idx < pages.length - 1) {
        const br = document.createElement('br');
        br.setAttribute('clear', 'all');
        br.setAttribute('style', 'page-break-before:always; mso-break-type:section-break');
        page.parentNode?.insertBefore(br, page.nextSibling);
      }
    });
    d.querySelectorAll('.word-page-number').forEach(el => el.remove());
    d.querySelectorAll('.page-break').forEach(el => {
      const br = document.createElement('br');
      br.setAttribute('clear', 'all');
      br.setAttribute('style', 'page-break-before:always; mso-break-type:section-break');
      el.parentNode?.replaceChild(br, el);
    });
    return d.innerHTML;
  };

  const exportAsWord = async (): Promise<void> => {
    if (!editorRef.current) return;
    try {
      const raw = editorRef.current.getContent();
      const cleaned = cleanContentForExport(raw);
      const statusBar = editorRef.current.getContainer().querySelector('.tox-statusbar__text-container');
      if (statusBar) statusBar.textContent = 'Preparing Word document...';
      const processed = preprocessContentForWordExport(cleaned);
      const blob = await htmlToDocx(processed, documentTitle, {
        pageSize: 'A4',
        pageMargins: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }
      });
      if (statusBar) {
        statusBar.textContent = 'Word document ready';
        setTimeout(() => { statusBar.textContent = ''; }, 3000);
      }
      try {
        saveAs(blob, `${documentTitle.replace(/\s+/g, '_')}.docx`);
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentTitle.replace(/\s+/g, '_')}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Error exporting to Word:', e);
      const statusBar = editorRef.current?.getContainer().querySelector('.tox-statusbar__text-container');
      if (statusBar) {
        statusBar.textContent = 'Export failed';
        setTimeout(() => { statusBar.textContent = ''; }, 3000);
      }
      alert(`Failed to export: ${(e as Error).message}`);
    }
  };

  const cleanContentForImport = (content: string): string => {
    const d = document.createElement('div');
    d.innerHTML = content;
    d.querySelectorAll('.page-break, [class*="page-break"]').forEach(el => el.remove());
    d.querySelectorAll('.page-indicator, .page-count, .word-page-number, [class*="page-indicator"], [class*="page-count"]').forEach(el => el.remove());
    d.querySelectorAll('*').forEach(el => {
      if (el.textContent && /Page\s+\d+\s+of\s+\d+/i.test(el.textContent)) el.remove();
    });
    d.querySelectorAll('[class*="tox-"], [class*="toolbar-"]').forEach(el => el.remove());
    const existingPages = d.querySelectorAll('.word-page');
    if (existingPages.length === 0) {
      const all = d.innerHTML;
      d.innerHTML = `
        <div class="word-page" data-page="1">
          <div class="word-page-content">
            ${all || '<p><br></p>'}
          </div>
        </div>
      `;
    } else {
      existingPages.forEach((page, idx) => {
        page.setAttribute('data-page', String(idx + 1));
        page.querySelectorAll('.word-page-number').forEach(n => n.remove());
        let cc = page.querySelector('.word-page-content');
        if (!cc) {
          cc = document.createElement('div');
          cc.className = 'word-page-content';
          while (page.firstChild && page.firstChild !== cc) {
            cc.appendChild(page.firstChild);
          }
          page.appendChild(cc);
        }
      });
    }
    return d.innerHTML;
  };

  const importFromHtml = (): void => {
    triggerHtmlImport((content) => {
      if (!editorRef.current) return;
      const cleaned = cleanContentForImport(content);
      editorRef.current.setContent(cleaned);
      setContent(cleaned);
      setTimeout(() => editorRef.current?.__reflowDocument?.('import'), 100);
    });
  };

  React.useEffect(() => {
    const loadTinyMCE = (): void => {
      if (window.tinymce) {
        initializeTinyMCE();
        return;
      }
      const existing = document.querySelector('script[src="/tinymce/js/tinymce/tinymce.min.js"]');
      if (existing) existing.remove();
      const script = document.createElement('script');
      script.src = '/tinymce/js/tinymce/tinymce.min.js';
      script.onload = () => {
        if (window.tinymce) setTimeout(initializeTinyMCE, 400);
      };
      script.onerror = (e) => console.error('TinyMCE load error', e);
      document.head.appendChild(script);
    };

    const initializeTinyMCE = (): void => {
      if (!window.tinymce) return;
      const existing = window.tinymce.get('editor');
      if (existing) existing.remove();

      window.tinymce.init({
        selector: '#editor',
        license_key: 'gpl',
        height: 800,
        branding: false,
        promotion: false,
        menubar: props.readOnly ? false : 'file edit view insert format tools table help',
        readonly: props.readOnly || false,
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
          'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'preview', 'help', 'wordcount'
        ],
        toolbar: props.readOnly
          ? 'visualblocks code fullscreen | printdoc | pageindicator | help'
          : 'undo redo | fontfamily fontsize removeformat | forecolor backcolor | ' +
          'bold italic underline strikethrough | alignleft aligncenter ' +
          'alignright alignjustify | bullist numlist outdent indent | ' +
          'link image table | insertdatetime charmap | pagebreak | ' +
          'searchreplace | visualblocks code fullscreen | ' +
          'savehtml importhtml exportword printdoc printqrdoc | pageindicator | help',
        toolbar_mode: 'sliding',
        fontsize_formats: '8pt 9pt 10pt 11pt 12pt 14pt 16pt 18pt 20pt 22pt 24pt 26pt 28pt 30pt 32pt 36pt 40pt 44pt 48pt 54pt 60pt 66pt 72pt',
        font_family_formats: 'Arial=arial,helvetica,sans-serif;' +
          'Calibri=calibri,sans-serif;' +
          'Cambria=cambria,serif;' +
          'Times New Roman=times new roman,times;' +
          'Verdana=verdana,geneva;',
        content_style: `
          body { font-family:'Calibri','Arial',sans-serif; font-size:11pt; line-height:1.15; margin:0; padding:20px; background:#f5f5f5; }
          .word-page { width:21cm; height:29.7cm; margin:0 auto 1cm auto; background:#fff; position:relative; box-sizing:border-box; overflow:hidden; page-break-after:always; }
          .word-page + .word-page { margin-top:1cm; border-top:2px solid #f0f0f0; padding-top:10px; }
          .word-page-content { width:calc(21cm - 5.08cm); height:calc(29.7cm - 5.08cm); margin:2.54cm; padding:0; overflow:hidden; box-sizing:border-box; position:relative; }
          .word-page-content p { margin:0 0 6pt 0; min-height:1.2em; line-height:1.15; }
          .word-page-content p:empty::after { content:''; display:inline-block; width:1px; height:1.2em; visibility:hidden; }
          .mce-content-body { background:transparent!important; padding:0!important; margin:0!important; min-height:100vh!important; }
          [data-page-break="true"] { border-top:1px dashed #ccc; height:0; margin:8px 0; }
          @media print {
            body { background:#fff!important; margin:0!important; padding:0!important; }
            .word-page { width:21cm!important; height:29.7cm!important; margin:0!important; box-shadow:none!important; page-break-after:always; }
            .word-page:last-child { page-break-after:auto; }
            .word-page-content { width:calc(21cm - 5.08cm)!important; height:calc(29.7cm - 5.08cm)!important; margin:2.54cm!important; }
          }
        `,
        statusbar: true,
        resize: true,
        setup: (editor: TinyMCEEditor) => {
          editorRef.current = editor;
          editor.__reflowDocument = reflowDocument;

          editor.on('change keyup', () => setContent(editor.getContent()));

          let selThrottle = false;
          editor.on('selectionchange NodeChange', () => {
            if (selThrottle) return;
            selThrottle = true;
            setTimeout(() => {
              selectionEpochRef.current++;
              selThrottle = false;
            }, 50);
          });

          editor.ui.registry.addButton('savehtml', {
            text: 'Save', icon: 'save',
            tooltip: 'Save Document as HTML',
            onAction: () => saveDocument()
          });
          editor.ui.registry.addButton('importhtml', {
            text: 'Import', icon: 'upload',
            tooltip: 'Import HTML Document',
            onAction: () => importFromHtml()
          });
          editor.ui.registry.addButton('exportword', {
            text: 'Word', icon: 'document-properties',
            tooltip: 'Export as Word Document',
            onAction: () => exportAsWord()
          });
          editor.ui.registry.addButton('printdoc', {
            text: 'Print', icon: 'print',
            tooltip: 'Print Document',
            onAction: () => printDocument()
          });
          editor.ui.registry.addButton('printqrdoc', {
            text: 'Print with QR',
            icon: 'qr-code',
            tooltip: 'Print with QR Code Watermark',
            onAction: () => printWithQRWatermark()
          });

          editor.ui.registry.addButton('pageindicator', {
            text: `Page ${currentPage} of ${pageCount}`,
            tooltip: 'Current Page of Total Pages',
            onAction: () => { },
            onSetup: (api: TinyMCEButtonAPI) => {
              const update = (): void => {
                const pages = editor.getDoc().querySelectorAll('.word-page');
                const total = pages.length;
                let curr = 1;
                const node = editor.selection?.getNode();
                const page = (node as Element)?.closest?.('.word-page');
                if (page) curr = parseInt(page.getAttribute('data-page') || '1', 10);
                setCurrentPage(curr);
                setPageCount(total);
                api.setText(`Page ${curr} of ${total}`);
              };
              api.setEnabled(false);
              update();
              editor.on('NodeChange selectionchange PageCountChanged', update);
              const intv = setInterval(update, 1500);
              return () => {
                editor.off('NodeChange selectionchange PageCountChanged', update);
                clearInterval(intv);
              };
            }
          });

          editor.addCommand('mcePageBreak', () => {
            const doc = editor.getDoc();
            const sentinel = createPageBreakSentinel(doc);
            const rng = editor.selection.getRng();
            const container = rng.startContainer;
            let block = container.nodeType === 1 ? (container as Element) : container.parentElement;
            while (block && !isBlockElement(block)) block = block?.parentElement || null;
            if (block && block.nextSibling) {
              block.parentNode?.insertBefore(sentinel, block.nextSibling);
            } else if (block && block.parentNode) {
              block.parentNode.appendChild(sentinel);
            } else {
              editor.getBody().appendChild(sentinel);
            }
            scheduleReflow('manual-page-break', 30);
          });

          editor.on('init', () => {
            const body = editor.getBody();
            body.style.overflow = 'auto';
            body.style.minHeight = '100vh';
            const hasContent = body.innerHTML.trim() && body.innerHTML.trim() !== '<p><br></p>';
            if (!hasContent) {
              body.innerHTML = `
                <div class="word-page" data-page="1">
                  <div class="word-page-content">
                    <p><br></p>
                  </div>
                </div>
              `;
            }
            body.classList.add('word-document');
            editor.execCommand('FontName', false, 'Calibri');
            editor.execCommand('FontSize', false, '11pt');
            setTimeout(() => reflowDocument('init'), 200);
          });

          editor.on('keydown', (e?: TinyMCEEvent) => {
            if (!e) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              setTimeout(() => {
                const markerId = insertCaretMarker(editor);
                reflowDocument('enter', markerId);
              }, 10);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
              scheduleReflow('delete', 120);
            }
          });

          editor.on('paste', () => {
            setTimeout(() => {
              const markerId = insertCaretMarker(editor);
              reflowDocument('paste', markerId);
            }, 30);
          });

          editor.on('input', (e?: TinyMCEEvent) => {
            if (!e) return;
            const t = e.inputType || '';
            if (/insertParagraph|insertFromPaste|deleteContent|insertOrderedList|insertUnorderedList/.test(t)) {
              scheduleReflow(t, 60);
            } else if (t === 'insertText') {
              if (shouldTriggerTypingReflow(editor)) {
                scheduleReflow('typing', 120);
              }
            }
          });

          editor.on('SetContent', () => scheduleReflow('setContent', 100));
          editor.on('Undo Redo', () => scheduleReflow('history-change', 100));
          editor.on('ObjectResized', () => scheduleReflow('object-resized', 140));

          window.insertPageBreak = () => editor.execCommand('mcePageBreak');
        },
        init_instance_callback: (editor: TinyMCEEditor) => {
          const style = document.createElement('style');
          style.textContent = `
            .tox-editor-container { border:1px solid #d1d1d1!important; }
            .tox-edit-area { background:#f5f5f5!important; padding:20px!important; }
            .tox-edit-area iframe { background:#f5f5f5!important; overflow-y:auto!important; }
            .tox-tbtn[aria-label*="Current Page of Total Pages"] {
              background:transparent!important; border:none!important; cursor:default!important;
              color:#333!important; font-weight:500!important; pointer-events:none!important;
            }
          `;
          document.head.appendChild(style);

          setTimeout(() => {
            const body = editor.getBody();
            if (!body.querySelector('.word-page')) {
              console.log('Editor lacks page structure. Initializing with a default page.');

              const initialPageContent = `
                <div class="word-page" data-page="1">
                  <div class="word-page-content">
                    <p><br></p>
                  </div>
                </div>
              `;
              editor.setContent(initialPageContent);

              setTimeout(() => {
                const firstParagraph = editor.getBody().querySelector('.word-page-content p');
                if (firstParagraph) {
                  editor.selection.setCursorLocation(firstParagraph, 0);
                  editor.focus();
                  console.log('Cursor positioned correctly inside the first page.');
                }
              }, 100);
            }
          }, 200);
        }
      });
    };

    loadTinyMCE();
    return () => {
      if (window.tinymce && window.tinymce.get('editor')) {
        window.tinymce.get('editor')!.remove();
      }
    };
  }, [props.readOnly]);

  React.useImperativeHandle(ref, () => ({
    getEditor: () => editorRef.current,
    getContent: () => editorRef.current?.getContent() || '',
    setContent: (content: string) => setContentWithPageManagement(content),
    focus: () => editorRef.current?.focus(),
    insertContent: (html: string) => editorRef.current?.execCommand('mceInsertContent', false, html),
    getTitle: () => documentTitle,
    setTitle: (title: string) => setDocumentTitle(title || ''),
    reflow: (reason: string = 'manual') => editorRef.current?.__reflowDocument?.(reason)
  }));

  return (
    <div className="word-editor-container">
      <div className="document-title-container">
        <input
          type="text"
          value={documentTitle}
          onChange={(e) => setDocumentTitle(e.target.value)}
          className="document-title-input"
          placeholder="Document Title"
          readOnly={props.readOnly || false}
          style={props.readOnly ? { backgroundColor: '#f8f9fa', cursor: 'default' } : {}}
        />
      </div>
      <textarea
        id="editor"
        style={{ width: '100%', height: '800px' }}
        defaultValue=""
      />
    </div>
  );
});

WordLikeEditor.displayName = 'WordLikeEditor';

export default WordLikeEditor;
