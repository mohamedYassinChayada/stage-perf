/**
 * HTML to Word conversion utility using docx library
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { IRunOptions, FileChild } from 'docx';
import { saveAs } from 'file-saver';

type DocxElement = FileChild;

/**
 * Convert HTML content to Word document using docx library
 */
export const htmlToDocx = async (
  htmlContent: string,
  title: string = 'Document',
  _options: Record<string, unknown> = {}
): Promise<Blob> => {
  try {
    console.log('Converting HTML to DOCX using docx library...');
    console.log('HTML Content length:', htmlContent?.length || 0);
    console.log('Title:', title);

    const docElements = parseHtmlToDocxElements(htmlContent);

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1800,
              bottom: 1440,
              left: 1800,
            },
          },
        },
        children: docElements,
      }],
    });

    const buffer = await Packer.toBlob(doc);
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
    saveAs(buffer, fileName);

    console.log('Word document created and downloaded successfully!');
    return buffer;

  } catch (error) {
    console.error('Error converting HTML to Word:', error);
    throw new Error(`Failed to create Word document: ${(error as Error).message}`);
  }
};

function parseHtmlToDocxElements(htmlContent: string): DocxElement[] {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [new Paragraph({ text: 'No content provided' })];
  }

  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const elementsToRemove = tempDiv.querySelectorAll(
      '.word-page-number, .word-page-header, .word-page-footer, .tox-, script, style[data-mce-bogus]'
    );
    elementsToRemove.forEach(el => el.remove());

    const docElements: DocxElement[] = [];

    const pages = tempDiv.querySelectorAll('.word-page');

    if (pages.length > 0) {
      pages.forEach((page, index) => {
        if (index > 0) {
          docElements.push(new Paragraph({ children: [new PageBreak()] }));
        }

        const pageElements = processPageContent(page);
        docElements.push(...pageElements);
      });
    } else {
      for (const node of Array.from(tempDiv.childNodes)) {
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

function processPageContent(page: Element): DocxElement[] {
  const docElements: DocxElement[] = [];
  let consecutiveEmptyParagraphs = 0;
  const maxConsecutiveEmptyParagraphs = 2;

  for (const node of Array.from(page.childNodes)) {
    const elements = processNode(node);

    if (elements.length === 1 && elements[0] instanceof Paragraph) {
      const isEmptyParagraph = node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName === 'P' &&
        (!node.textContent?.trim() || node.textContent.trim() === '\u00A0');

      if (isEmptyParagraph) {
        consecutiveEmptyParagraphs++;

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

function processNode(node: Node): DocxElement[] {
  const elements: DocxElement[] = [];

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

  const element = node as Element;
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
    case 'p': {
      const textContent = element.textContent?.trim();
      if (textContent && textContent !== '\u00A0') {
        elements.push(createParagraph(element));
      } else {
        elements.push(new Paragraph({ text: '' }));
      }
      break;
    }
    case 'div':
      if (element.classList.contains('page-break') ||
        element.hasAttribute('data-mce-word-pagebreak')) {
        break;
      }

      if (element.classList.contains('word-page')) {
        for (const child of Array.from(element.childNodes)) {
          elements.push(...processNode(child));
        }
        break;
      }

      for (const child of Array.from(element.childNodes)) {
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
      for (const child of Array.from(element.childNodes)) {
        elements.push(...processNode(child));
      }
      break;
  }

  return elements;
}

function createHeading(element: Element, tagName: string): Paragraph {
  const headingLevels: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
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

function createParagraph(element: Element): Paragraph {
  const textRuns = createTextRuns(element);
  const alignment = getAlignment(element);

  return new Paragraph({
    children: textRuns,
    alignment: alignment,
  });
}

function createTextRuns(element: Element, parentElement?: Element): TextRun[] {
  const textRuns: TextRun[] = [];

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text?.trim()) {
        textRuns.push(new TextRun({
          text: text,
          ...getTextFormatting(element),
        }));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childElement = node as Element;
      const childText = childElement.textContent;

      if (childText?.trim()) {
        textRuns.push(new TextRun({
          text: childText,
          ...getTextFormatting(childElement, parentElement || element),
        }));
      }
    }
  }

  if (textRuns.length === 0) {
    textRuns.push(new TextRun({ text: element.textContent || '' }));
  }

  return textRuns;
}

function getTextFormatting(element: Element, _parentElement?: Element): IRunOptions {
  const htmlElement = element as HTMLElement;
  const style = htmlElement.style;

  const isBold = element.tagName === 'STRONG' || element.tagName === 'B' ||
    style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700;

  const isItalic = element.tagName === 'EM' || element.tagName === 'I' ||
    style.fontStyle === 'italic';

  const isUnderline = element.tagName === 'U' || style.textDecoration?.includes('underline');

  const isStrike = element.tagName === 'S' || element.tagName === 'STRIKE' ||
    style.textDecoration?.includes('line-through');

  let textColor: string | undefined;
  const color = style.color;
  if (color && color !== 'black' && color !== '#000000') {
    const hexColor = colorToHex(color);
    if (hexColor) {
      textColor = hexColor;
    }
  }

  let textSize: number | undefined;
  const fontSize = style.fontSize;
  if (fontSize) {
    const sizeInPt = parseFloat(fontSize);
    if (!isNaN(sizeInPt)) {
      textSize = Math.round(sizeInPt * 2);
    }
  }

  // Build the formatting object - IRunOptions properties are readonly, so we must construct it all at once
  const formatting: IRunOptions = {
    ...(isBold && { bold: true }),
    ...(isItalic && { italics: true }),
    ...(isUnderline && { underline: {} }),
    ...(isStrike && { strike: true }),
    ...(textColor && { color: textColor }),
    ...(textSize && { size: textSize }),
  };

  return formatting;
}

function getAlignment(element: Element): typeof AlignmentType[keyof typeof AlignmentType] {
  const htmlElement = element as HTMLElement;
  const textAlign = htmlElement.style.textAlign;

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

function createList(element: Element, isOrdered: boolean = false): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const listItems = element.querySelectorAll('li');

  listItems.forEach((li, index) => {
    const textRuns = createTextRuns(li);
    const bulletText = isOrdered ? `${index + 1}. ` : '• ';

    textRuns.unshift(new TextRun({ text: bulletText }));

    paragraphs.push(new Paragraph({
      children: textRuns,
      indent: {
        left: 720,
      },
    }));
  });

  return paragraphs;
}

function createTable(element: Element): Table {
  const rows: TableRow[] = [];
  const tableRows = element.querySelectorAll('tr');

  tableRows.forEach(tr => {
    const cells: TableCell[] = [];
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

function colorToHex(color: string): string | null {
  try {
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computedColor = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);

    const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    return null;
  } catch {
    return null;
  }
}

export const createTestDocument = async (): Promise<void> => {
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
    `;

    await htmlToDocx(testHtml, 'Test Document');
    console.log('Test document created successfully!');
  } catch (error) {
    console.error('Test document creation failed:', error);
    throw error;
  }
};

export const exportAsCleanHtml = (htmlContent: string, _title: string = 'Document'): string => {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const elementsToRemove = tempDiv.querySelectorAll(
      '.word-page-number, .word-page-header, .word-page-footer, .tox-, script, style[data-mce-bogus]'
    );
    elementsToRemove.forEach(el => el.remove());

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

function cleanupEmptyParagraphs(container: Element): void {
  const paragraphs = container.querySelectorAll('p');
  let consecutiveEmptyCount = 0;
  const maxConsecutiveEmpty = 2;

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
}

export const downloadAsHtml = (htmlContent: string, title: string = 'Document'): void => {
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

export const exportAsPdf = (htmlContent: string, title: string = 'Document'): void => {
  const cleanHtml = exportAsCleanHtml(htmlContent, title);

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @page { size: A4; margin: 1in; }
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
        .word-page:last-child { page-break-after: avoid; }
        .page-break { page-break-before: always; }
        .word-page-number { display: none; }
        p { margin: 0 0 12pt 0; }
        h1, h2, h3, h4, h5, h6 {
            margin: 12pt 0 6pt 0;
            page-break-after: avoid;
        }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        td, th { border: 1px solid black; padding: 6pt; text-align: left; }
        ul, ol { margin: 12pt 0; padding-left: 24pt; }
        table, ul, ol { page-break-inside: avoid; }
        * { box-sizing: border-box; }
    </style>
</head>
<body>
    ${cleanHtml}
    <script>
        window.onload = function() {
            window.print();
            setTimeout(() => { window.close(); }, 1000);
        };
    </script>
</body>
</html>`;

  printWindow.document.write(fullHtml);
  printWindow.document.close();
};

export const importFromHtml = async (file: File): Promise<string> => {
  try {
    if (!file || !file.type.includes('html')) {
      throw new Error('Please select a valid HTML file');
    }

    const htmlContent = await readFileContent(file);
    const processedContent = processHtmlForTinyMCE(htmlContent);

    return processedContent;

  } catch (error) {
    console.error('Error importing HTML:', error);
    throw new Error(`Failed to import HTML file: ${(error as Error).message}`);
  }
};

function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      resolve(event.target?.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

function processHtmlForTinyMCE(htmlContent: string): string {
  try {
    const tempDiv = document.createElement('div');

    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const contentToProcess = bodyMatch ? bodyMatch[1] : htmlContent;

    tempDiv.innerHTML = contentToProcess;

    const pages = tempDiv.querySelectorAll('.word-page');

    if (pages.length === 0) {
      const content = tempDiv.innerHTML;
      tempDiv.innerHTML = `<div class="word-page" data-word-page="true">${content}</div>`;
    }

    const pagesAfterProcessing = tempDiv.querySelectorAll('.word-page');
    pagesAfterProcessing.forEach((page, index) => {
      let pageNumber = page.querySelector('.word-page-number');
      if (!pageNumber) {
        pageNumber = document.createElement('div');
        pageNumber.className = 'word-page-number';
        pageNumber.setAttribute('data-mce-word-ignore', 'true');
        pageNumber.setAttribute('contenteditable', 'false');
        (pageNumber as HTMLElement).style.cssText = 'position: absolute; bottom: 1cm; left: 0px; right: 0px; text-align: center; font-size: 12px; color: #777777; z-index: 1000;';
        pageNumber.innerHTML = `Page ${index + 1} of ${pagesAfterProcessing.length}`;
        page.appendChild(pageNumber);
      }
    });

    const finalPages = tempDiv.querySelectorAll('.word-page');
    if (finalPages.length > 1) {
      for (let i = 0; i < finalPages.length - 1; i++) {
        const currentPage = finalPages[i];
        const nextPage = finalPages[i + 1];

        let hasPageBreak = false;
        let nextSibling = currentPage.nextSibling;

        while (nextSibling && nextSibling !== nextPage) {
          if (nextSibling.nodeType === Node.ELEMENT_NODE &&
            ((nextSibling as Element).classList?.contains('page-break') ||
              (nextSibling as Element).hasAttribute?.('data-mce-word-pagebreak'))) {
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
          currentPage.parentNode?.insertBefore(pageBreak, nextPage);
        }
      }
    }

    return tempDiv.innerHTML;

  } catch (error) {
    console.error('Error processing HTML for TinyMCE:', error);
    return htmlContent;
  }
}

export const createHtmlImportInput = (callback: (content: string) => void): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.html,.htm';
  input.style.display = 'none';

  input.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      try {
        const content = await importFromHtml(file);
        callback(content);
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import HTML file: ' + (error as Error).message);
      }
    }
  });

  return input;
};

export const triggerHtmlImport = (callback: (content: string) => void): void => {
  const input = createHtmlImportInput(callback);
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
};

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
