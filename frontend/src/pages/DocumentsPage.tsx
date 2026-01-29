import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  getDocumentsPaginated,
  deleteDocument,
  createDocument,
  formatFileSize,
  formatDate,
  getQRCodeUrl,
  listLabels,
  createLabel,
  setDocumentLabels,
  listCollections,
  setDocumentCollections,
  searchStandard,
  searchDeep,
  searchByQRFile
} from '../services/documentService';
import type { Document, Label, Collection } from '../services/documentService';
import { Link, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { showSnackbar } from '../components/Snackbar';
import { usePageCache } from '../contexts/PageCacheContext';
import './DocumentsPage.css';

const DOCS_PER_PAGE = 10;

const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { getDocumentsCache, setDocumentsCache, clearDocumentsCache } = usePageCache();

  // Pagination state
  const [pageCache, setPageCacheState] = useState<Map<number, Document[]>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [labelManagerDocId, setLabelManagerDocId] = useState<number | null>(null);
  const [labelSelection, setLabelSelection] = useState<number[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [collectionManagerDocId, setCollectionManagerDocId] = useState<number | null>(null);
  const [collectionSelection, setCollectionSelection] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deepQuery, setDeepQuery] = useState('');
  const [searchLabels, setSearchLabels] = useState<number[]>([]);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<Document[]>([]);

  // QR Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  // Persist cache to context whenever it changes
  const syncCacheToContext = useCallback((
    cache: Map<number, Document[]>,
    page: number,
    count: number,
    pages: number,
    lbls: Label[],
    cols: Collection[]
  ) => {
    setDocumentsCache({
      pageCache: new Map(cache),
      currentPage: page,
      totalCount: count,
      totalPages: pages,
      labels: lbls,
      collections: cols,
      timestamp: Date.now(),
    });
  }, [setDocumentsCache]);

  // Load a specific page of documents
  const loadPage = useCallback(async (page: number, forceRefresh = false): Promise<void> => {
    // Check in-memory cache first
    if (!forceRefresh && pageCache.has(page)) {
      setCurrentPage(page);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getDocumentsPaginated(page, DOCS_PER_PAGE);
      const pages = Math.ceil(response.count / DOCS_PER_PAGE);

      setPageCacheState(prev => {
        const next = new Map(prev);
        next.set(page, response.results);
        return next;
      });
      setCurrentPage(page);
      setTotalCount(response.count);
      setTotalPages(pages);
    } catch (err) {
      setError('Failed to load documents: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pageCache]);

  const loadLabels = async (): Promise<void> => {
    try {
      const ls = await listLabels();
      setLabels(ls);
    } catch {
      // ignore
    }
  };

  const loadCollections = async (): Promise<void> => {
    try {
      const cs = await listCollections();
      setCollections(cs);
    } catch {
      // ignore
    }
  };

  // Restore from context cache on mount, or fetch fresh
  useEffect(() => {
    const cached = getDocumentsCache();
    if (cached) {
      setPageCacheState(new Map(cached.pageCache));
      setCurrentPage(cached.currentPage);
      setTotalCount(cached.totalCount);
      setTotalPages(cached.totalPages);
      setLabels(cached.labels);
      setCollections(cached.collections);
      setLoading(false);
    } else {
      loadPage(1);
      loadLabels();
      loadCollections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync cache to context when pagination state changes
  useEffect(() => {
    if (pageCache.size > 0 && totalCount > 0) {
      syncCacheToContext(pageCache, currentPage, totalCount, totalPages, labels, collections);
    }
  }, [pageCache, currentPage, totalCount, totalPages, labels, collections, syncCacheToContext]);

  // Current page documents
  const currentDocuments = isSearchMode ? searchResults : (pageCache.get(currentPage) || []);

  const goToPage = (page: number): void => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    loadPage(page);
  };

  // Refresh current page after mutations
  const refreshCurrentPage = async (): Promise<void> => {
    // Clear the whole cache since counts may have changed
    setPageCacheState(new Map());
    clearDocumentsCache();
    await loadPage(currentPage, true);
  };

  const handleCreateDocument = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!selectedFile || !documentTitle.trim()) {
      showSnackbar('Please provide both a title and a file.', 'error');
      return;
    }

    try {
      setCreating(true);
      await createDocument(documentTitle.trim(), selectedFile);

      setDocumentTitle('');
      setSelectedFile(null);
      setShowCreateForm(false);

      showSnackbar('Document created successfully with QR code!', 'success');
      await refreshCurrentPage();
    } catch (err) {
      showSnackbar('Failed to create document: ' + (err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDocument = async (documentId: number, docTitle: string): Promise<void> => {
    if (!window.confirm(`Are you sure you want to delete "${docTitle}"?`)) {
      return;
    }

    try {
      await deleteDocument(documentId);
      showSnackbar('Document deleted successfully!', 'success');
      await refreshCurrentPage();
    } catch (err) {
      showSnackbar('Failed to delete document: ' + (err as Error).message, 'error');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);

    if (file && !documentTitle.trim()) {
      const nameWithoutExtension = file.name.split('.').slice(0, -1).join('.');
      setDocumentTitle(nameWithoutExtension);
    }
  };

  const openQRCode = (documentId: number): void => {
    const qrUrl = getQRCodeUrl(documentId);
    window.open(qrUrl, '_blank');
  };

  // Labels
  const openLabelManager = (doc: Document): void => {
    setLabelManagerDocId(doc.id);
    const current = (doc.labels || []).map(l => l.id);
    setLabelSelection(current);
  };

  const toggleLabelSelection = (id: number): void => {
    setLabelSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveLabels = async (docId: number): Promise<void> => {
    try {
      await setDocumentLabels(docId, labelSelection);
      await refreshCurrentPage();
      setLabelManagerDocId(null);
    } catch { showSnackbar('Failed to save labels', 'error'); }
  };

  const addLabel = async (): Promise<void> => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createLabel(newLabelName.trim());
      setNewLabelName('');
      await loadLabels();
      setLabelSelection(prev => [...prev, created.id]);
    } catch { showSnackbar('Failed to create label', 'error'); }
  };

  // Collections
  const openCollectionManager = (doc: Document): void => {
    setCollectionManagerDocId(doc.id);
    const current = (doc.collections || []).map(c => c.id);
    setCollectionSelection(current);
  };

  const toggleCollectionSelection = (id: number): void => {
    setCollectionSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveCollections = async (docId: number): Promise<void> => {
    try {
      await setDocumentCollections(docId, collectionSelection);
      await refreshCurrentPage();
      setCollectionManagerDocId(null);
    } catch { showSnackbar('Failed to save collections', 'error'); }
  };

  // Search handlers
  const handleStandardSearch = async (): Promise<void> => {
    try {
      const res = await searchStandard(searchQuery, searchLabels);
      setSearchResults(res);
      setIsSearchMode(true);
    } catch (e) {
      showSnackbar((e as Error).message || 'Search failed', 'error');
    }
  };

  const handleDeepSearch = async (): Promise<void> => {
    if (!deepQuery.trim()) return;
    try {
      const res = await searchDeep(deepQuery.trim());
      setSearchResults(res);
      setIsSearchMode(true);
    } catch (e) {
      showSnackbar((e as Error).message || 'Deep search failed', 'error');
    }
  };

  const handleQRFileSearch = async (): Promise<void> => {
    if (!qrFile) return;
    try {
      const { document } = await searchByQRFile(qrFile);
      setSearchResults([document]);
      setIsSearchMode(true);
    } catch (e) {
      showSnackbar((e as Error).message || 'QR search failed', 'error');
    }
  };

  const clearSearch = (): void => {
    setSearchQuery('');
    setDeepQuery('');
    setSearchLabels([]);
    setIsSearchMode(false);
    setSearchResults([]);
  };

  // QR Camera Scanner Functions
  const startCameraScanner = async (): Promise<void> => {
    try {
      setShowCameraScanner(true);
      setIsScanning(true);
      isScanningRef.current = true;
      setScanResult('');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      });

      setCameraStream(stream);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            isScanningRef.current = true;
            setTimeout(() => {
              startQRScanning();
            }, 200);
          }).catch(() => {
            // video play error
          });
        }
      }, 100);

    } catch {
      showSnackbar('Failed to access camera. Please check permissions and try again.', 'error');
      setShowCameraScanner(false);
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  const startQRScanning = (): void => {
    const scanFrame = (): void => {
      if (!videoRef.current || !canvasRef.current || !isScanningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(scanFrame);
        return;
      }

      const width = video.videoWidth || video.clientWidth || 640;
      const height = video.videoHeight || video.clientHeight || 480;

      if (width <= 0 || height <= 0) {
        requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = width;
      canvas.height = height;

      try {
        ctx.drawImage(video, 0, 0, width, height);

        let qrCode = null;
        let imageData: ImageData;

        try {
          imageData = ctx.getImageData(0, 0, width, height);
        } catch {
          requestAnimationFrame(scanFrame);
          return;
        }

        if (!imageData || !imageData.data || imageData.data.length === 0) {
          requestAnimationFrame(scanFrame);
          return;
        }

        try {
          qrCode = jsQR(imageData.data, width, height, {
            inversionAttempts: 'attemptBoth',
          });
        } catch {
          // continue
        }

        if (qrCode) {
          setScanResult(qrCode.data);
          stopCameraScanner();
          handleQRScanResult(qrCode.data);
          return;
        }

        if (isScanningRef.current) {
          requestAnimationFrame(scanFrame);
        }

      } catch {
        if (isScanningRef.current) {
          requestAnimationFrame(scanFrame);
        }
      }
    };

    requestAnimationFrame(scanFrame);
  };

  const stopCameraScanner = (): void => {
    setIsScanning(false);
    isScanningRef.current = false;

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }

    scanIntervalRef.current = null;
    setShowCameraScanner(false);
    setScanResult('');
  };

  const handleQRScanResult = async (qrData: string): Promise<void> => {
    try {
      const urlMatch = qrData.match(/\/qr\/resolve\/([^\/\?]+)/);
      const code = urlMatch ? urlMatch[1] : qrData.trim();

      const token = localStorage.getItem('token');
      const apiUrl = `http://127.0.0.1:8000/api/qr/resolve/${encodeURIComponent(code)}/`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const resolveData = await response.json();
        navigate(`/documents/${resolveData.document_id}`);
      } else {
        throw new Error(`QR resolution failed (${response.status})`);
      }
    } catch (error) {
      showSnackbar(`QR Scan Failed: ${(error as Error).message}`, 'error');
    }
  };

  // Cleanup camera on component unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      isScanningRef.current = false;
    };
  }, []);

  // Pagination controls renderer
  const renderPagination = (): React.ReactNode => {
    if (isSearchMode || totalPages <= 1) return null;

    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="pagination">
        <div className="pagination-info">
          Showing {((currentPage - 1) * DOCS_PER_PAGE) + 1}–{Math.min(currentPage * DOCS_PER_PAGE, totalCount)} of {totalCount} documents
        </div>
        <div className="pagination-controls">
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => goToPage(1)}
            title="First page"
          >
            &laquo;
          </button>
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => goToPage(currentPage - 1)}
            title="Previous page"
          >
            &lsaquo;
          </button>
          {start > 1 && <span className="pagination-ellipsis">...</span>}
          {pages.map(p => (
            <button
              key={p}
              className={`pagination-btn ${p === currentPage ? 'active' : ''} ${pageCache.has(p) && p !== currentPage ? 'cached' : ''}`}
              onClick={() => goToPage(p)}
            >
              {p}
            </button>
          ))}
          {end < totalPages && <span className="pagination-ellipsis">...</span>}
          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => goToPage(currentPage + 1)}
            title="Next page"
          >
            &rsaquo;
          </button>
          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => goToPage(totalPages)}
            title="Last page"
          >
            &raquo;
          </button>
        </div>
      </div>
    );
  };

  if (loading && pageCache.size === 0) {
    return (
      <div className="documents-page">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading your documents</p>
          <p className="loading-subtext">Fetching documents, labels, and collections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-page">
      <div className="documents-header">
        <h1>Document Management</h1>
        <p>Manage your documents with automatic QR code generation</p>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : 'Upload Document'}
        </button>
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 8 }}>Search</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Search by title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button className="btn btn-secondary" onClick={handleStandardSearch}>Search</button>
            <button className="btn" onClick={clearSearch}>Clear</button>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {labels.map(l => (
              <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={searchLabels.includes(l.id)} onChange={() => setSearchLabels(prev => prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id])} />
                {l.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Deep search (content)..." value={deepQuery} onChange={e => setDeepQuery(e.target.value)} />
            <button className="btn btn-secondary" onClick={handleDeepSearch}>Deep search</button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept="image/*" onChange={e => setQrFile(e.target.files?.[0] || null)} />
              <button className="btn btn-secondary" disabled={!qrFile} onClick={handleQRFileSearch}>Search by QR File</button>
              <button
                className="btn btn-primary"
                onClick={startCameraScanner}
                title="Scan QR code with camera"
              >
                Scan QR Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => loadPage(currentPage, true)} className="btn btn-secondary">
            Retry
          </button>
        </div>
      )}

      {/* QR Camera Scanner Modal */}
      {showCameraScanner && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          color: 'white'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: 'black'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333' }}>
              Scan QR Code with Camera
            </h3>

            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  maxWidth: '640px',
                  height: 'auto',
                  borderRadius: '8px',
                  backgroundColor: '#000',
                  transform: 'scaleX(-1)',
                }}
                playsInline
                muted
                autoPlay
              />

              {isScanning && (
                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  fontSize: '14px'
                }}>
                  Scanning for QR codes...
                </div>
              )}

              {scanResult && (
                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0,255,0,0.8)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  fontSize: '14px'
                }}>
                  QR Code Found!
                </div>
              )}
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-danger"
                onClick={() => stopCameraScanner()}
                style={{ minWidth: '100px' }}
              >
                Cancel
              </button>
            </div>

            <div style={{
              marginTop: '12px',
              fontSize: '14px',
              color: '#666',
              textAlign: 'center',
              maxWidth: '400px'
            }}>
              <p style={{ margin: '8px 0' }}>
                <strong>Position the QR code within the frame</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="create-document-form">
          <h3>Upload New Document</h3>
          <form onSubmit={handleCreateDocument}>
            <div className="form-group">
              <label htmlFor="document-title">Document Title:</label>
              <input
                id="document-title"
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="Enter document title"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="document-file">Select File:</label>
              <input
                id="document-file"
                type="file"
                onChange={handleFileChange}
                accept="image/*,.pdf"
                required
              />
              {selectedFile && (
                <div className="file-info">
                  <p>Selected: {selectedFile.name}</p>
                  <p>Size: {formatFileSize(selectedFile.size)}</p>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Document'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pagination - Top */}
      {renderPagination()}

      {isSearchMode && (
        <div className="search-results-banner">
          Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          <button className="btn btn-secondary" onClick={clearSearch} style={{ marginLeft: 12 }}>
            Back to all documents
          </button>
        </div>
      )}

      <div className="documents-list">
        {loading && pageCache.size > 0 && (
          <div className="page-loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}
        {currentDocuments.length === 0 && !loading ? (
          <div className="no-documents">
            <h3>No documents found</h3>
            <p>Upload your first document to get started!</p>
          </div>
        ) : (
          <div className="documents-grid">
            {currentDocuments.map(document => (
              <div key={document.id} className="document-card">
                <div className="document-header">
                  <h3 className="document-title">{document.title}</h3>
                  <span className="document-id">ID: {document.id}</span>
                </div>

                <div className="document-content">
                  <div className="document-info">
                    <p><strong>Author:</strong> {document.owner_username || 'Unknown'}</p>
                    <p><strong>Created:</strong> {formatDate(document.created_at)}</p>
                    <p><strong>Updated:</strong> {formatDate(document.updated_at)}</p>
                    {document.file_url && (
                      <p>
                        <strong>Original File:</strong>
                        <a
                          href={document.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="file-link"
                        >
                          View Original
                        </a>
                      </p>
                    )}
                    {!document.file_url && document.attachments && document.attachments.length > 0 && (
                      <p>
                        <strong>Original File:</strong>
                        <a
                          href={document.attachments[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="file-link"
                        >
                          {document.attachments[0].filename}
                        </a>
                      </p>
                    )}
                    {document.labels && document.labels.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <strong>Labels:</strong>{' '}
                        {document.labels.map(l => (
                          <span key={l.id} style={{ display: 'inline-block', padding: '2px 6px', margin: '2px 4px', background: '#eef', borderRadius: 6, fontSize: 12 }}>{l.name}</span>
                        ))}
                      </div>
                    )}
                    {document.collections && document.collections.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <strong>Collections:</strong>{' '}
                        {document.collections.map(c => (
                          <span key={c.id} style={{ display: 'inline-block', padding: '2px 6px', margin: '2px 4px', background: '#efe', borderRadius: 6, fontSize: 12 }}>{c.name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="qr-code-section">
                    {document.qr_code_url ? (
                      <div className="qr-code-container">
                        <h4>QR Code</h4>
                        <img
                          src={document.qr_code_url}
                          alt={`QR Code for ${document.title}`}
                          className="qr-code-image"
                          onClick={() => openQRCode(document.id)}
                          title="Click to open QR code in new tab"
                        />
                      </div>
                    ) : (
                      <div className="qr-code-placeholder">
                        <p>QR code not available</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="document-actions">
                  <button
                    onClick={() => openQRCode(document.id)}
                    className="btn btn-info"
                    title="View QR Code"
                  >
                    QR Code
                  </button>
                  {document.file_url && (
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      title="View Original File"
                    >
                      Original File
                    </a>
                  )}
                  <Link
                    to={`/documents/${document.id}`}
                    className="btn btn-primary"
                    title="Open in Editor"
                  >
                    Edit Content
                  </Link>
                  <button
                    className="btn btn-secondary"
                    title="Manage Labels"
                    onClick={() => openLabelManager(document)}
                  >
                    Manage Labels
                  </button>
                  <button
                    className="btn btn-secondary"
                    title="Manage Collections"
                    onClick={() => openCollectionManager(document)}
                  >
                    Manage Collections
                  </button>
                  <Link
                    to={`/documents/${document.id}/access`}
                    className="btn btn-secondary"
                    title="Manage Access"
                  >
                    Manage Access
                  </Link>
                  <Link
                    to={`/documents/${document.id}/versions`}
                    className="btn btn-secondary"
                    title="Version History"
                  >
                    Versions
                  </Link>
                  <Link
                    to={`/documents/${document.id}/audit`}
                    className="btn btn-secondary"
                    title="Audit Log"
                  >
                    Audit Log
                  </Link>
                  <button
                    onClick={() => handleDeleteDocument(document.id, document.title)}
                    className="btn btn-danger"
                    title="Delete Document"
                  >
                    Delete
                  </button>
                </div>
                {labelManagerDocId === document.id && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {labels.map(l => (
                        <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={labelSelection.includes(l.id)} onChange={() => toggleLabelSelection(l.id)} />
                          {l.name}
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <input placeholder="New label" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} />
                      <button className="btn btn-secondary" onClick={addLabel}>Add Label</button>
                      <button className="btn btn-primary" onClick={() => saveLabels(document.id)}>Save Labels</button>
                      <button className="btn" onClick={() => setLabelManagerDocId(null)}>Close</button>
                    </div>
                  </div>
                )}
                {collectionManagerDocId === document.id && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {collections.map(c => (
                        <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={collectionSelection.includes(c.id)} onChange={() => toggleCollectionSelection(c.id)} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" onClick={() => saveCollections(document.id)}>Save Collections</button>
                      <button className="btn" onClick={() => setCollectionManagerDocId(null)}>Close</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination - Bottom */}
      {renderPagination()}
    </div>
  );
};

export default DocumentsPage;
