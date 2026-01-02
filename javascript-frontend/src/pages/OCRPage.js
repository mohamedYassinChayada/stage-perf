import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import WordLikeEditor from '../components/WordLikeEditor';
import { extractTextFromFile, formatTextForEditor, formatOCRForTinyMCE, isSupportedFileType, formatFileSize } from '../services/ocrService';
import { createDocumentFromOCR, getDocument } from '../services/documentService';
import './OCRPage.css';

const OCRPage = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingDocument, setLoadingDocument] = useState(false);
  
  // Get query parameters to check if we're opening an existing document
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const documentId = queryParams.get('documentId');
  
  // Ref to access the WordLikeEditor
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load document if documentId is provided
  useEffect(() => {
    const loadDocumentContent = async () => {
      if (documentId) {
        try {
          setLoadingDocument(true);
          setError('');
          
          // Fetch the document data
          const document = await getDocument(documentId);
          
          // Check if document has HTML content
          if (document.html_content) {
            // Insert HTML content into editor
            setTimeout(() => {
              if (editorRef.current && editorRef.current.getEditor()) {
                editorRef.current.setContent(document.html_content);
                setSuccess(`Document "${document.title}" loaded successfully!`);
              }
            }, 500);
          } else {
            setError('This document does not have any HTML content to edit.');
          }
          
        } catch (err) {
          setError(`Failed to load document: ${err.message}`);
          console.error('Error loading document:', err);
        } finally {
          setLoadingDocument(false);
        }
      }
    };
    
    loadDocumentContent();
  }, [documentId]);

  // Handle file selection
  const handleFileSelect = (file) => {
    setError('');
    setSuccess('');
    setOcrResult(null);

    if (!file) return;

    // Validate file type
    if (!isSupportedFileType(file)) {
      setError('Unsupported file type. Please upload PNG, JPEG, or PDF files only.');
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File size (${formatFileSize(file.size)}) exceeds maximum allowed size (10MB).`);
      return;
    }

    setSelectedFile(file);
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  };

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Process OCR
  const processOCR = async () => {
    if (!selectedFile) {
      setError('Please select a file first.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setSuccess('');
    setProcessingStatus('Uploading file...');

    try {
      setProcessingStatus('Processing OCR with positioning...');
      const result = await extractTextFromFile(selectedFile, true); // Use detailed endpoint
      
      setOcrResult(result);
      setProcessingStatus('OCR completed successfully!');
      
      // Enhanced success message with positioning info
      const positionInfo = result.lines ? 
        ` Found ${result.total_blocks || 0} text blocks in ${result.total_lines || 0} lines.` : '';
      setSuccess(`Text extracted successfully! Processing time: ${result.processing_time}s${positionInfo}`);
      
      // Auto-insert text into editor after a short delay
      setTimeout(() => {
        insertPositionedTextIntoEditor(result);
      }, 500);

    } catch (error) {
      console.error('OCR processing failed:', error);
      setError(`OCR processing failed: ${error.message}`);
      setProcessingStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Insert extracted text into TinyMCE editor (legacy method)
  const insertTextIntoEditor = (text) => {
    if (editorRef.current && editorRef.current.getEditor()) {
      const editor = editorRef.current.getEditor();
      
      // Format the text for TinyMCE
      const formattedText = formatTextForEditor(text);
      
      // Get current cursor position
      const currentContent = editor.getContent();
      
      // If editor is empty or only has default page structure, replace content
      if (!currentContent || currentContent.trim() === '' || 
          currentContent === '<div class="word-page" data-word-page="true"></div>') {
        
        // Set content in the first page
        editor.setContent(`<div class="word-page" data-word-page="true">${formattedText}</div>`);
      } else {
        // Insert at current cursor position
        editor.execCommand('mceInsertContent', false, formattedText);
      }
      
      // Focus the editor
      editor.focus();
      
      // Scroll to the inserted content
      setTimeout(() => {
        const body = editor.getBody();
        body.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  };

  // Insert OCR result with positioning into TinyMCE editor
  const insertPositionedTextIntoEditor = (ocrResult) => {
    if (editorRef.current && editorRef.current.getEditor()) {
      const editor = editorRef.current.getEditor();
      
      console.log('Inserting OCR result with positioning:', ocrResult);
      
      // Format the OCR result. This now returns an object with 'type' and 'html'.
      const formattedResult = formatOCRForTinyMCE(ocrResult);
      
      const currentContent = editor.getContent();
      
      // Define the canonical empty state for the editor.
      const canonicalEmptyContent = '<div class="word-page" data-page="1"><div class="word-page-content"><p><br></p></div></div>';
      
      // Check if the editor is empty or contains only the default placeholder content.
      if (!currentContent || currentContent.trim() === '' || currentContent.trim() === canonicalEmptyContent) {
        
        let newContent;
        // If the result from OCR is a 'full' document (from a PDF), use it directly.
        if (formattedResult.type === 'full') {
          newContent = formattedResult.html;
        } else {
          // If it's a 'fragment' (from an image), wrap it in the required page structure.
          newContent = `
            <div class="word-page" data-page="1">
              <div class="word-page-content">
                ${formattedResult.html}
              </div>
            </div>
          `;
        }
        editor.setContent(newContent);

      } else {
        // --- DEFENSIVE CHECK ---
        // Editor has existing content. Ensure cursor is inside a page before inserting.
        const selection = editor.selection;
        const currentNode = selection.getNode();
        
        if (!currentNode.closest('.word-page-content')) {
          console.warn('Cursor was outside page structure. Moving to the end of the document.');
          // Find the last element in the last page to move the cursor to.
          const lastPage = editor.getBody().querySelector('.word-page-content:last-child');
          if (lastPage) {
            editor.selection.select(lastPage, true);
            editor.selection.collapse(false); // false collapses to the end
          }
        }
        
        // If the editor already has content, just insert the HTML fragment.
        editor.execCommand('mceInsertContent', false, formattedResult.html);
      }
      
      // Focus the editor and scroll to the new content.
      editor.focus();
      
      // Scroll to the inserted content
      setTimeout(() => {
        const body = editor.getBody();
        
        // Find the OCR content that was just inserted
        const ocrContent = body.querySelector('.ocr-content:last-of-type');
        if (ocrContent) {
          ocrContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          body.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    }
  };

  // Clear selected file
  const clearFile = () => {
    setSelectedFile(null);
    setError('');
    setSuccess('');
    setOcrResult(null);
    setProcessingStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Save as document with QR code
  const saveAsDocument = async () => {
    if (!selectedFile || !ocrResult) {
      setError('No OCR result to save. Please process a file first.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      // Get document title from the title input above TinyMCE (WordLikeEditor)
      let documentTitle = editorRef.current?.getTitle?.();
      if (!documentTitle || !documentTitle.trim()) {
        // Fallback to filename-derived title if user left title empty
        const baseTitle = selectedFile.name.split('.').slice(0, -1).join('.');
        documentTitle = `OCR: ${baseTitle}`;
      }

      // Get extracted text
      const extractedText = ocrResult.text || ocrResult.extracted_text || '';
      
      // Get HTML content from editor if available
      let htmlContent = '';
      if (editorRef.current && editorRef.current.getEditor()) {
        htmlContent = editorRef.current.getEditor().getContent();
      }

      // Create document with QR code
      const savedDocument = await createDocumentFromOCR(
        documentTitle,
        selectedFile,
        extractedText,
        htmlContent
      );

      setSuccess(`Document "${documentTitle}" saved successfully with QR code! Document ID: ${savedDocument.id}`);
      
      // Optional: Clear form after successful save
      setTimeout(() => {
        clearFile();
        setSuccess('');
      }, 5000);

    } catch (err) {
      setError('Failed to save document: ' + err.message);
      console.error('Error saving document:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ocr-page">
      <div className="ocr-header">
        <h1>{documentId ? 'Edit Document' : 'OCR Document Editor'}</h1>
        <p>{documentId 
          ? 'View and edit the OCR-processed document.' 
          : 'Upload images or PDF files to extract text and edit in the document editor below.'}</p>
      </div>

      {loadingDocument ? (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading document...</p>
        </div>
      ) : documentId ? (
        <>
          {error && (
            <div className="status-message error">
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {success && (
            <div className="status-message success">
              <strong>Success:</strong> {success}
            </div>
          )}
        </>
      ) : (
        <div className="ocr-upload-section">
          <div className="ocr-controls">
            {/* File Upload Area */}
            <div 
              className={`file-upload-area ${dragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.pdf"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              
              <div className="upload-content">
                {selectedFile ? (
                  <div className="selected-file">
                    <div className="file-icon">📄</div>
                    <div className="file-info">
                      <div className="file-name">{selectedFile.name}</div>
                      <div className="file-details">
                        {formatFileSize(selectedFile.size)} • {selectedFile.type}
                      </div>
                    </div>
                    <button 
                      className="clear-file-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFile();
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">📁</div>
                    <div className="upload-text">
                      <strong>Click to upload</strong> or drag and drop
                    </div>
                    <div className="upload-hint">
                      PNG, JPEG, PDF (max 10MB)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Process Button */}
            <button 
              className="process-btn"
              onClick={processOCR}
              disabled={!selectedFile || isProcessing}
            >
              {isProcessing ? (
                <>
                  <span className="spinner"></span>
                  Processing...
                </>
              ) : (
                'Extract Text'
              )}
            </button>
          </div>

          {/* Status Messages */}
          {processingStatus && (
            <div className="status-message processing">
              {processingStatus}
            </div>
          )}

          {error && (
            <div className="status-message error">
              <strong>Error:</strong> {error}
            </div>
          )}

          {success && (
            <div className="status-message success">
              <strong>Success:</strong> {success}
            </div>
          )}

          {/* OCR Result Info */}
          {ocrResult && (
            <div className="ocr-result-info">
              <h3>OCR Results</h3>
              <div className="result-stats">
                <span><strong>File:</strong> {ocrResult.filename}</span>
                <span><strong>Type:</strong> {ocrResult.file_type}</span>
                <span><strong>Processing Time:</strong> {ocrResult.processing_time}s</span>
                <span><strong>Characters:</strong> {(ocrResult.text || ocrResult.extracted_text || '').length}</span>
                {ocrResult.total_lines && (
                  <span><strong>Lines:</strong> {ocrResult.total_lines}</span>
                )}
                {ocrResult.total_blocks && (
                  <span><strong>Text Blocks:</strong> {ocrResult.total_blocks}</span>
                )}
                {ocrResult.confidence && (
                  <span><strong>Confidence:</strong> {(ocrResult.confidence * 100).toFixed(1)}%</span>
                )}
                {ocrResult.image_size && (
                  <span><strong>Image Size:</strong> {ocrResult.image_size.width}×{ocrResult.image_size.height}px</span>
                )}
              </div>
              
              {/* Positioning Toggle */}
              <div className="positioning-info">
                <p>
                  <strong>✨ Enhanced OCR:</strong> 
                  {ocrResult.lines && ocrResult.lines.length > 0 
                    ? ' Text positioning preserved from original image layout'
                    : ' Basic text extraction (no positioning data)'
                  }
                </p>
              </div>

              {/* Save as Document Button */}
              <div className="save-document-section">
                <button 
                  className="save-document-btn"
                  onClick={saveAsDocument}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="spinner"></span>
                      Saving Document...
                    </>
                  ) : (
                    <>
                      💾 Save as Document with QR Code
                    </>
                  )}
                </button>
                <p className="save-document-info">
                  Save this OCR result as a document in the database with automatic QR code generation
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TinyMCE Editor */}
      <div className="editor-section">
        <WordLikeEditor ref={editorRef} />
      </div>
    </div>
  );
};

export default OCRPage;