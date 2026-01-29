import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { 
  getAllDocuments, 
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
import './DocumentsPage.css';

const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
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
  
  // QR Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  // Load documents on component mount
  useEffect(() => {
    loadDocuments();
    loadLabels();
    loadCollections();
  }, []);

  const loadDocuments = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const documentsData = await getAllDocuments();
      setDocuments(documentsData);
    } catch (err) {
      setError('Failed to load documents: ' + (err as Error).message);
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!selectedFile || !documentTitle.trim()) {
      alert('Please provide both a title and a file.');
      return;
    }

    try {
      setCreating(true);
      const newDocument = await createDocument(documentTitle.trim(), selectedFile);
      
      // Add the new document to the list
      setDocuments(prev => [newDocument, ...prev]);
      
      // Reset form
      setDocumentTitle('');
      setSelectedFile(null);
      setShowCreateForm(false);
      
      alert('Document created successfully with QR code!');
    } catch (err) {
      alert('Failed to create document: ' + (err as Error).message);
      console.error('Error creating document:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDocument = async (documentId: number, documentTitle: string): Promise<void> => {
    if (!window.confirm(`Are you sure you want to delete "${documentTitle}"?`)) {
      return;
    }

    try {
      await deleteDocument(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      alert('Document deleted successfully!');
    } catch (err) {
      alert('Failed to delete document: ' + (err as Error).message);
      console.error('Error deleting document:', err);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    
    // Auto-generate title from filename if title is empty
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
  const loadLabels = async (): Promise<void> => {
    try {
      const ls = await listLabels();
      setLabels(ls);
    } catch {
      // ignore
    }
  };

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
      await loadDocuments();
      setLabelManagerDocId(null);
    } catch { alert('Failed to save labels'); }
  };

  const addLabel = async (): Promise<void> => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createLabel(newLabelName.trim());
      setNewLabelName('');
      await loadLabels();
      setLabelSelection(prev => [...prev, created.id]);
    } catch { alert('Failed to create label'); }
  };

  // Collections
  const loadCollections = async (): Promise<void> => {
    try {
      const cs = await listCollections();
      setCollections(cs);
    } catch {
      // ignore
    }
  };

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
      await loadDocuments();
      setCollectionManagerDocId(null);
    } catch { alert('Failed to save collections'); }
  };

  // QR Camera Scanner Functions
  const startCameraScanner = async (): Promise<void> => {
    console.log('📷 Initializing QR Camera Scanner...');
    
    try {
      setShowCameraScanner(true);
      setIsScanning(true);
      isScanningRef.current = true;
      setScanResult('');

      console.log('📷 Requesting camera access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      });

      console.log('✅ Camera access granted!');
      setCameraStream(stream);

      setTimeout(() => {
        if (videoRef.current) {
          console.log('📹 Setting up video element...');
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            console.log('▶️ Video started playing');
            isScanningRef.current = true;
            setTimeout(() => {
              startQRScanning();
            }, 200);
          }).catch((playError) => {
            console.error('❌ Video play error:', playError);
          });
        }
      }, 100);

    } catch (error) {
      console.error('Error starting camera:', error);
      alert('Failed to access camera. Please check permissions and try again.');
      setShowCameraScanner(false);
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  const startQRScanning = (): void => {
    console.log('🎬 Starting QR Scanning...');
    
    const scanFrame = (): void => {
      if (!videoRef.current || !canvasRef.current || !isScanningRef.current) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return;
      }

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
          console.log('🎯 QR CODE DETECTED!', qrCode.data);
          setScanResult(qrCode.data);
          stopCameraScanner('QR code detected');
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

  const stopCameraScanner = (reason: string = 'unknown'): void => {
    console.log('🛑 Stopping QR Camera Scanner - Reason:', reason);
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
    console.log('🔍 QR Scanner - Raw QR Data:', qrData);

    try {
      // Extract the QR code from the URL pattern
      const urlMatch = qrData.match(/\/qr\/resolve\/([^\/\?]+)/);
      const code = urlMatch ? urlMatch[1] : qrData.trim();

      console.log('🔑 QR Scanner - Extracted code:', code);

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
        console.log('✅ QR Resolution Success:', resolveData);

        navigate(`/documents/${resolveData.document_id}`);
      } else {
        throw new Error(`QR resolution failed (${response.status})`);
      }
    } catch (error) {
      console.error('❌ QR Scanner Error:', error);
      alert(`QR Scan Failed: ${(error as Error).message}`);
      loadDocuments();
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

  const filteredDocuments = documents;

  if (loading) {
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
            <input placeholder="Search by title…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button className="btn btn-secondary" onClick={async () => { try { const res = await searchStandard(searchQuery, searchLabels); setDocuments(res); } catch (e) { alert((e as Error).message || 'Search failed'); } }}>Search</button>
            <button className="btn" onClick={() => { setSearchQuery(''); setSearchLabels([]); loadDocuments(); }}>Clear</button>
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
            <input placeholder="Deep search (content)…" value={deepQuery} onChange={e => setDeepQuery(e.target.value)} />
            <button className="btn btn-secondary" onClick={async () => { try { if (!deepQuery.trim()) return; const res = await searchDeep(deepQuery.trim()); setDocuments(res); } catch (e) { alert((e as Error).message || 'Deep search failed'); } }}>Deep search</button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept="image/*" onChange={e => setQrFile(e.target.files?.[0] || null)} />
              <button className="btn btn-secondary" disabled={!qrFile} onClick={async () => { try { const { document } = await searchByQRFile(qrFile!); setDocuments([document]); } catch (e) { alert((e as Error).message || 'QR search failed'); } }}>Search by QR File</button>
              <button 
                className="btn btn-primary" 
                onClick={startCameraScanner}
                title="Scan QR code with camera"
              >
                📷 Scan QR Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadDocuments} className="btn btn-secondary">
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
              📷 Scan QR Code with Camera
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
                  🔍 Scanning for QR codes...
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
                  ✅ QR Code Found!
                </div>
              )}
            </div>
            
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-danger" 
                onClick={() => stopCameraScanner('user cancelled')}
                style={{ minWidth: '100px' }}
              >
                ❌ Cancel
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
                <strong>🎯 Position the QR code within the frame</strong>
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

      <div className="documents-list">
        {documents.length === 0 ? (
          <div className="no-documents">
            <h3>No documents found</h3>
            <p>Upload your first document to get started!</p>
          </div>
        ) : (
          <div className="documents-grid">
            {filteredDocuments.map(document => (
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
                    📱 QR Code
                  </button>
                  {document.file_url && (
                    <a 
                      href={document.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      title="View Original File"
                    >
                      📄 Original File
                    </a>
                  )}
                  <Link 
                    to={`/documents/${document.id}`} 
                    className="btn btn-primary"
                    title="Open in Editor"
                  >
                    ✏️ Edit Content
                  </Link>
                  <button 
                    className="btn btn-secondary"
                    title="Manage Labels"
                    onClick={() => openLabelManager(document)}
                  >
                    🏷️ Manage Labels
                  </button>
                  <button 
                    className="btn btn-secondary"
                    title="Manage Collections"
                    onClick={() => openCollectionManager(document)}
                  >
                    📚 Manage Collections
                  </button>
                  <Link 
                    to={`/documents/${document.id}/access`} 
                    className="btn btn-secondary"
                    title="Manage Access"
                  >
                    🔐 Manage Access
                  </Link>
                  <Link 
                    to={`/documents/${document.id}/versions`} 
                    className="btn btn-secondary"
                    title="Version History"
                  >
                    📚 Versions
                  </Link>
                  <Link 
                    to={`/documents/${document.id}/audit`} 
                    className="btn btn-secondary"
                    title="Audit Log"
                  >
                    📋 Audit Log
                  </Link>
                  <button 
                    onClick={() => handleDeleteDocument(document.id, document.title)}
                    className="btn btn-danger"
                    title="Delete Document"
                  >
                    🗑️ Delete
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
    </div>
  );
};

export default DocumentsPage;
