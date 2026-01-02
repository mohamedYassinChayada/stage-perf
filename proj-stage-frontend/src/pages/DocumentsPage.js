import React, { useState, useEffect, useRef } from 'react';
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
  searchByQRFile,
} from '../services/documentService';
import { Link, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import './DocumentsPage.css';

const DocumentsPage = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [labels, setLabels] = useState([]);
  const [collections, setCollections] = useState([]);
  const [labelManagerDocId, setLabelManagerDocId] = useState(null);
  const [labelSelection, setLabelSelection] = useState([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [collectionManagerDocId, setCollectionManagerDocId] = useState(null);
  const [collectionSelection, setCollectionSelection] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deepQuery, setDeepQuery] = useState('');
  const [searchLabels, setSearchLabels] = useState([]);
  const [qrFile, setQrFile] = useState(null);
  
  // QR Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false); // Synchronous scanning state

  // Load documents on component mount
  useEffect(() => {
    loadDocuments();
    loadLabels();
    loadCollections();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const documentsData = await getAllDocuments();
      setDocuments(documentsData);
    } catch (err) {
      setError('Failed to load documents: ' + err.message);
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async (e) => {
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
      alert('Failed to create document: ' + err.message);
      console.error('Error creating document:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDocument = async (documentId, documentTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${documentTitle}"?`)) {
      return;
    }

    try {
      await deleteDocument(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      alert('Document deleted successfully!');
    } catch (err) {
      alert('Failed to delete document: ' + err.message);
      console.error('Error deleting document:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    
    // Auto-generate title from filename if title is empty
    if (file && !documentTitle.trim()) {
      const nameWithoutExtension = file.name.split('.').slice(0, -1).join('.');
      setDocumentTitle(nameWithoutExtension);
    }
  };

  const openQRCode = (documentId) => {
    const qrUrl = getQRCodeUrl(documentId);
    window.open(qrUrl, '_blank');
  };

  // Labels
  const loadLabels = async () => {
    try {
      const ls = await listLabels();
      setLabels(ls);
    } catch {}
  };

  const openLabelManager = (doc) => {
    setLabelManagerDocId(doc.id);
    const current = (doc.labels || []).map(l => l.id);
    setLabelSelection(current);
  };

  const toggleLabelSelection = (id) => {
    setLabelSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveLabels = async (docId) => {
    try {
      await setDocumentLabels(docId, labelSelection);
      await loadDocuments();
      setLabelManagerDocId(null);
    } catch { alert('Failed to save labels'); }
  };

  const addLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createLabel(newLabelName.trim());
      setNewLabelName('');
      await loadLabels();
      setLabelSelection(prev => [...prev, created.id]);
    } catch { alert('Failed to create label'); }
  };

  // Collections
  const loadCollections = async () => {
    try {
      const cs = await listCollections();
      setCollections(cs);
    } catch {}
  };

  const openCollectionManager = (doc) => {
    setCollectionManagerDocId(doc.id);
    const current = (doc.collections || []).map(c => c.id);
    setCollectionSelection(current);
  };

  const toggleCollectionSelection = (id) => {
    setCollectionSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const saveCollections = async (docId) => {
    try {
      await setDocumentCollections(docId, collectionSelection);
      await loadDocuments();
      setCollectionManagerDocId(null);
    } catch { alert('Failed to save collections'); }
  };

  // QR Camera Scanner Functions
  const startCameraScanner = async () => {
    console.log('📷 Initializing QR Camera Scanner...');
    
    try {
      setShowCameraScanner(true);
      setIsScanning(true);
      isScanningRef.current = true; // Set ref immediately
      setScanResult('');

      console.log('📷 Requesting camera access...');
      
      // Request camera access with higher resolution for better QR detection
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          advanced: [
            { focusMode: 'continuous' },
            { exposureMode: 'continuous' },
            { whiteBalanceMode: 'continuous' }
          ]
        }
      });

      console.log('✅ Camera access granted! Stream:', stream);
      console.log('📱 Video tracks:', stream.getVideoTracks().map(track => ({
        kind: track.kind,
        label: track.label,
        settings: track.getSettings()
      })));

      setCameraStream(stream);

      // Wait for video element to be ready
      setTimeout(() => {
        if (videoRef.current) {
          console.log('📹 Setting up video element...');
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            console.log('▶️ Video started playing');
            console.log('🔄 Current scanning state before starting scan:', {
              isScanning: isScanning,
              isScanningRef: isScanningRef.current
            });
            
            // Double-check scanning state and ensure it's true
            if (!isScanning || !isScanningRef.current) {
              console.log('⚠️ Scanning state was false, setting it to true again');
              setIsScanning(true);
              isScanningRef.current = true;
            }
            
            setTimeout(() => {
              console.log('🔄 Final scanning state check before QR scan:', {
                isScanning: isScanning,
                isScanningRef: isScanningRef.current
              });
              
              // Ensure ref is true before starting
              isScanningRef.current = true;
              startQRScanning();
            }, 200); // Give extra time for state to update
          }).catch((playError) => {
            console.error('❌ Video play error:', playError);
          });
        } else {
          console.error('❌ Video ref not available');
        }
      }, 100);

    } catch (error) {
      console.error('Error starting camera:', error);
      alert('Failed to access camera. Please check permissions and try again.');
      setShowCameraScanner(false);
      setIsScanning(false);
      isScanningRef.current = false; // Set ref immediately
    }
  };

  const startQRScanning = () => {
    console.log('🎬 Starting QR Scanning...');
    console.log('🎬 Initial scanning states:', {
      isScanning: isScanning,
      isScanningRef: isScanningRef.current
    });
    
    const scanFrame = () => {
      if (!videoRef.current || !canvasRef.current || !isScanningRef.current) {
        console.log('📹 Scan frame stopped: Missing refs or not scanning', {
          hasVideo: !!videoRef.current,
          hasCanvas: !!canvasRef.current,
          isScanning: isScanning,
          isScanningRef: isScanningRef.current
        });
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Validate context
      if (!ctx) {
        console.error('❌ Cannot get canvas 2d context');
        return;
      }

      // Wait for video to be ready
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        console.log('📹 Video not ready, waiting... readyState:', video.readyState);
        requestAnimationFrame(scanFrame);
        return;
      }

      // Use actual video dimensions for better quality
      const width = video.videoWidth || video.clientWidth || 640;
      const height = video.videoHeight || video.clientHeight || 480;
      
      // Validate dimensions
      if (width <= 0 || height <= 0) {
        console.error('❌ Invalid video dimensions:', { width, height });
        requestAnimationFrame(scanFrame);
        return;
      }
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);
        
        // Periodic debug log (every 60 frames ≈ 1 second)
        if (!window.qrScanFrameCount) window.qrScanFrameCount = 0;
        window.qrScanFrameCount++;
        if (window.qrScanFrameCount % 60 === 0) {
          console.log('📸 QR Scanner Active - Frame:', window.qrScanFrameCount, 'Video size:', width, 'x', height);
        }

        // Try multiple QR scanning techniques for better detection
        let qrCode = null;

        // 1. Get image data with error handling
        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, width, height);
          // Only log image data details every 5 seconds to reduce console spam
          if (window.qrScanFrameCount % 300 === 0) {
            console.log('📸 Image data captured - Length:', imageData.data.length, 'Dimensions:', imageData.width, 'x', imageData.height);
          }
        } catch (e) {
          console.error('❌ Failed to get image data:', e);
          requestAnimationFrame(scanFrame);
          return;
        }

        // Validate image data
        if (!imageData || !imageData.data || imageData.data.length === 0) {
          console.error('❌ Invalid image data received');
          requestAnimationFrame(scanFrame);
          return;
        }

        // Try normal scan first
        try {
          qrCode = jsQR(imageData.data, width, height, {
            inversionAttempts: 'dontInvert',
          });
          if (qrCode) {
            console.log('✅ QR detected with normal scan');
          }
        } catch (e) {
          console.log('❌ Normal scan failed:', e.message);
        }

        // 2. Try with inverted colors
        if (!qrCode) {
          try {
            qrCode = jsQR(imageData.data, width, height, {
              inversionAttempts: 'onlyInvert',
            });
            if (qrCode) {
              console.log('✅ QR detected with inverted scan');
            }
          } catch (e) {
            console.log('❌ Inverted scan failed:', e.message);
          }
        }

        // 3. Try both inversion modes
        if (!qrCode) {
          try {
            qrCode = jsQR(imageData.data, width, height, {
              inversionAttempts: 'attemptBoth',
            });
            if (qrCode) {
              console.log('✅ QR detected with both inversion modes');
            }
          } catch (e) {
            console.log('❌ Both inversion modes failed:', e.message);
          }
        }

        // 4. Try with enhanced contrast
        if (!qrCode) {
          try {
            const enhancedImageData = enhanceImageForQR(ctx, width, height);
            if (enhancedImageData && enhancedImageData.data) {
              qrCode = jsQR(enhancedImageData.data, width, height, {
                inversionAttempts: 'attemptBoth',
              });
              if (qrCode) {
                console.log('✅ QR detected with enhanced contrast');
              }
            }
          } catch (e) {
            console.log('❌ Enhanced scanning failed:', e.message);
          }
        }

        // 5. Try scanning center region with higher priority
        if (!qrCode) {
          try {
            const centerX = Math.floor(width * 0.1);
            const centerY = Math.floor(height * 0.1);
            const centerWidth = Math.floor(width * 0.8);
            const centerHeight = Math.floor(height * 0.8);
            
            if (centerWidth > 0 && centerHeight > 0) {
              const centerImageData = ctx.getImageData(centerX, centerY, centerWidth, centerHeight);
              if (centerImageData && centerImageData.data) {
                qrCode = jsQR(centerImageData.data, centerWidth, centerHeight, {
                  inversionAttempts: 'attemptBoth',
                });
                if (qrCode) {
                  console.log('✅ QR detected in center region');
                }
              }
            }
          } catch (e) {
            console.log('❌ Center region scanning failed:', e.message);
          }
        }

        if (qrCode) {
          console.log('🎯🎯🎯 QR CODE SUCCESSFULLY DETECTED! 🎯🎯🎯');
          console.log('📱 QR Code Raw Data:', qrCode.data);
          console.log('📱 QR Code Data Type:', typeof qrCode.data);
          console.log('📱 QR Code Data Length:', qrCode.data.length);
          console.log('📱 QR Code Data (JSON):', JSON.stringify(qrCode.data));
          console.log('📱 QR Code Location:', qrCode.location);
          console.log('📱 QR Code Location Corner Points:', {
            topLeft: qrCode.location.topLeftCorner,
            topRight: qrCode.location.topRightCorner,
            bottomLeft: qrCode.location.bottomLeftCorner,
            bottomRight: qrCode.location.bottomRightCorner
          });
          console.log('📱 Full QR Code Object:', qrCode);
          
          // QR code detected - processing silently
          console.log('🎯 QR CODE DETECTED! Processing silently...', qrCode.data);
          
          setScanResult(qrCode.data);
          stopCameraScanner('QR code detected');
          handleQRScanResult(qrCode.data);
          return;
        }

        // Continue scanning with animation frame for smooth performance
        if (isScanningRef.current) {
          requestAnimationFrame(scanFrame);
        } else {
          console.log('📹 Stopping scan loop: isScanningRef is false');
        }

      } catch (drawError) {
        console.error('❌ Error in scan frame processing:', drawError);
        // Continue scanning even if this frame failed
        if (isScanningRef.current) {
          requestAnimationFrame(scanFrame);
        }
      }
    };

    // Start scanning with animation frame
    console.log('🎬 About to start first animation frame with states:', {
      isScanning: isScanning,
      isScanningRef: isScanningRef.current,
      hasVideo: !!videoRef.current,
      hasCanvas: !!canvasRef.current
    });
    requestAnimationFrame(scanFrame);
  };

  // Enhanced image processing for better QR detection
  const enhanceImageForQR = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Apply image enhancements
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale using luminance formula
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Calculate grayscale value
      let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      
      // Apply contrast enhancement
      const contrast = 1.8;
      const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
      gray = Math.round(factor * (gray - 128) + 128);
      
      // Clamp values
      gray = Math.max(0, Math.min(255, gray));
      
      // Apply threshold for black/white conversion
      const threshold = 128;
      gray = gray > threshold ? 255 : 0;
      
      // Set RGB channels to grayscale value
      data[i] = gray;       // Red
      data[i + 1] = gray;   // Green  
      data[i + 2] = gray;   // Blue
      // Alpha stays the same
    }
    
    return imageData;
  };

  const stopCameraScanner = (reason = 'unknown') => {
    console.log('🛑 Stopping QR Camera Scanner - Reason:', reason);
    console.trace('🛑 Stack trace for stopping scanner:'); // Show where this was called from
    setIsScanning(false);
    isScanningRef.current = false; // Set ref immediately
    
    // Reset frame counter
    if (window.qrScanFrameCount) {
      console.log('📊 Total frames scanned:', window.qrScanFrameCount);
      window.qrScanFrameCount = 0;
    }
    
    // Stop camera stream
    if (cameraStream) {
      console.log('📹 Stopping camera stream');
      cameraStream.getTracks().forEach(track => {
        console.log('🔌 Stopping track:', track.kind, track.label);
        track.stop();
      });
      setCameraStream(null);
    }

    // Clear any remaining references (no longer using setInterval)
    scanIntervalRef.current = null;

    setShowCameraScanner(false);
    setScanResult('');
    console.log('✅ QR Camera Scanner stopped');
  };

  const handleQRScanResult = async (qrData) => {
    console.log('🔍🔍🔍 QR RESULT HANDLER STARTED 🔍🔍🔍');
    console.log('🔍 QR Scanner - Raw QR Data Detected:', qrData);
    console.log('🔍 QR Scanner - QR Data Type:', typeof qrData);
    console.log('🔍 QR Scanner - QR Data Length:', qrData.length);
    console.log('🔍 QR Scanner - QR Data (escaped):', JSON.stringify(qrData));
    console.log('🔍 QR Scanner - QR Data (hex):', [...qrData].map(char => char.charCodeAt(0).toString(16)).join(' '));
    
    try {
      // Step 1: Extract potential QR codes from different formats
      let potentialCodes = [];
      
      // Format 1: Direct QR code (e.g., "doc-22-abc123")
      potentialCodes.push(qrData.trim());
      
      // Format 2: URL with QR code (e.g., "http://example.com/api/qr/resolve/doc-22-abc123/")
      const urlMatch = qrData.match(/\/qr\/resolve\/([^\/\?]+)/);
      if (urlMatch) {
        potentialCodes.push(urlMatch[1]);
        console.log('🔍 QR Scanner - Extracted from URL:', urlMatch[1]);
      }
      
      // Format 3: Full URL (e.g., "http://127.0.0.1:8000/api/qr/resolve/doc-22-abc123/")
      const fullUrlMatch = qrData.match(/qr\/resolve\/([^\/\?\s]+)/);
      if (fullUrlMatch) {
        potentialCodes.push(fullUrlMatch[1]);
        console.log('🔍 QR Scanner - Extracted from full URL:', fullUrlMatch[1]);
      }
      
      // Format 4: Just the code part after last slash
      if (qrData.includes('/')) {
        const lastPart = qrData.split('/').pop().trim();
        if (lastPart && lastPart !== qrData.trim()) {
          potentialCodes.push(lastPart);
          console.log('🔍 QR Scanner - Extracted last part:', lastPart);
        }
      }
      
      // Remove duplicates and empty strings
      potentialCodes = [...new Set(potentialCodes.filter(code => code && code.length > 0))];
      console.log('🔍 QR Scanner - All potential codes to try:', potentialCodes);
      
      // Step 2: Try resolving each potential code
      let documentFound = false;
      let lastError = null;
      
      for (let i = 0; i < potentialCodes.length; i++) {
        const codeToTry = potentialCodes[i];
        console.log(`🔍 QR Scanner - Attempt ${i + 1}/${potentialCodes.length}: Trying code "${codeToTry}"`);
        
        try {
          // Make the QR resolution API call with authentication
          const token = localStorage.getItem('token');
          const apiUrl = `http://127.0.0.1:8000/api/qr/resolve/${encodeURIComponent(codeToTry)}/`;
          
          console.log('🔍 QR Scanner - API URL:', apiUrl);
          console.log('🔍 QR Scanner - Token present:', !!token);
          console.log('🔍 QR Scanner - Token first 10 chars:', token ? token.substring(0, 10) + '...' : 'none');
          
          console.log('🌐 MAKING QR RESOLUTION API CALL...');
          const startTime = Date.now();
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Token ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          const endTime = Date.now();
          console.log(`🌐 API Response received in ${endTime - startTime}ms`);
          console.log('🔍 QR Scanner - API Response Status:', response.status);
          console.log('🔍 QR Scanner - API Response StatusText:', response.statusText);
          console.log('🔍 QR Scanner - API Response OK:', response.ok);
          console.log('🔍 QR Scanner - API Response Headers:', Object.fromEntries(response.headers.entries()));
          
          if (response.ok) {
            const resolveData = await response.json();
            console.log('✅ QR Scanner - QR Resolution Success:', resolveData);
            console.log('✅ QR Scanner - Document ID from backend:', resolveData.document_id);
            
            // Step 3: Get the actual document
            const documentApiUrl = `http://127.0.0.1:8000/api/documents/${resolveData.document_id}/`;
            console.log('🔍 QR Scanner - Fetching document from:', documentApiUrl);
            
            console.log('🌐 MAKING DOCUMENT FETCH API CALL...');
            const docStartTime = Date.now();
            
            const documentResponse = await fetch(documentApiUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            const docEndTime = Date.now();
            console.log(`🌐 Document API Response received in ${docEndTime - docStartTime}ms`);
            console.log('🔍 QR Scanner - Document API Response Status:', documentResponse.status);
            console.log('🔍 QR Scanner - Document API Response StatusText:', documentResponse.statusText);
            
            if (documentResponse.ok) {
              const document = await documentResponse.json();
              console.log('✅✅✅ QR Scanner - Document Retrieved Successfully! ✅✅✅');
              console.log('✅ Document Title:', document.title);
              console.log('✅ Document ID:', document.id);
              console.log('✅ Full Document Object:', document);
              
              // Open document directly in new tab without any popups
              console.log('🔄 Opening document in new tab:', `/documents/${document.id}`);
              window.open(`/documents/${document.id}`, '_blank');
              
              documentFound = true;
              break; // Success! Stop trying other codes
              
            } else {
              const errorData = await documentResponse.text().then(text => {
                try { return JSON.parse(text); } 
                catch { return { raw: text }; }
              });
              console.log('❌ QR Scanner - Document fetch failed:', documentResponse.status, errorData);
              lastError = new Error(`Document access denied (${documentResponse.status}): ${JSON.stringify(errorData)}`);
            }
          } else {
            const errorData = await response.text().then(text => {
              try { return JSON.parse(text); } 
              catch { return { raw: text }; }
            });
            console.log(`❌ QR Scanner - Code "${codeToTry}" failed:`, response.status, errorData);
            
            lastError = new Error(`QR resolution failed (${response.status}): ${JSON.stringify(errorData)}`);
            
            // If 404, try the next code. If other error, it might be auth issue
            if (response.status !== 404) {
              console.log('❌ Non-404 error, stopping attempts');
              break;
            }
          }
          
        } catch (codeError) {
          console.log(`❌ QR Scanner - Network/Parse Error with code "${codeToTry}":`, codeError);
          console.log('❌ Error name:', codeError.name);
          console.log('❌ Error message:', codeError.message);
          console.log('❌ Error stack:', codeError.stack);
          lastError = codeError;
          // Continue to next code unless it's the last one
        }
      }
      
      // If we tried all codes and none worked
      if (!documentFound) {
        const errorMsg = `QR code not recognized. Tried ${potentialCodes.length} different format(s). Last error: ${lastError ? lastError.message : 'Unknown'}`;
        console.error('❌❌❌ ALL QR RESOLUTION ATTEMPTS FAILED ❌❌❌');
        throw new Error(errorMsg);
      }
      
    } catch (error) {
      console.error('❌❌❌ QR SCANNER FINAL ERROR ❌❌❌');
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ QR Scanner - Final Error Object:', error);
      
      // Show detailed error to user
      const detailedError = `❌ QR Scan Failed ❌
      
Error: ${error.message}

QR Data: "${qrData}"

This could be a:
🔸 Frontend issue (QR parsing/network)
🔸 Backend issue (QR resolution/auth)
🔸 Permission issue (document access)

Check browser console for detailed logs.`;
      
      alert(detailedError);
      
      // Reset to show all documents
      console.log('🔄 QR Scanner - Resetting to show all documents');
      loadDocuments();
    }
  };

  // Cleanup camera on component unmount ONLY
  useEffect(() => {
    return () => {
      console.log('🧹 Component unmounting, cleaning up camera...');
      if (cameraStream) {
        console.log('🧹 Stopping camera stream during cleanup');
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      // Also ensure scanning state is reset
      isScanningRef.current = false;
    };
  }, []); // Remove cameraStream dependency to avoid premature cleanup

  // Show all documents (no filtering by collection)
  const filteredDocuments = documents;

  if (loading) {
    return (
      <div className="documents-page">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading documents...</p>
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
            <button className="btn btn-secondary" onClick={async ()=>{ try { const res = await searchStandard(searchQuery, searchLabels); setDocuments(res); } catch (e) { alert(e.message || 'Search failed'); } }}>Search</button>
            <button className="btn" onClick={()=>{ setSearchQuery(''); setSearchLabels([]); loadDocuments(); }}>Clear</button>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {labels.map(l => (
              <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={searchLabels.includes(l.id)} onChange={()=> setSearchLabels(prev => prev.includes(l.id) ? prev.filter(x=>x!==l.id) : [...prev, l.id])} />
                {l.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Deep search (content)…" value={deepQuery} onChange={e=> setDeepQuery(e.target.value)} />
            <button className="btn btn-secondary" onClick={async ()=>{ try { if (!deepQuery.trim()) return; const res = await searchDeep(deepQuery.trim()); setDocuments(res); } catch (e) { alert(e.message || 'Deep search failed'); } }}>Deep search</button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept="image/*" onChange={e=> setQrFile(e.target.files[0] || null)} />
              <button className="btn btn-secondary" disabled={!qrFile} onClick={async ()=>{ try { const { document } = await searchByQRFile(qrFile); setDocuments([document]); } catch (e) { alert(e.message || 'QR search failed'); } }}>Search by QR File</button>
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
                  transform: 'scaleX(-1)', // Flip camera horizontally for natural viewing
                }}
                playsInline
                muted
                autoPlay
              />
              
              {/* Scanning overlay with corner guides */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '280px',
                height: '280px',
                pointerEvents: 'none',
              }}>
                {/* Corner guides - top-left */}
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '40px',
                  height: '40px',
                  borderTop: '4px solid #00ff00',
                  borderLeft: '4px solid #00ff00',
                  borderRadius: '8px 0 0 0',
                  animation: 'pulse 2s infinite'
                }} />
                {/* Corner guides - top-right */}
                <div style={{
                  position: 'absolute',
                  top: '0',
                  right: '0',
                  width: '40px',
                  height: '40px',
                  borderTop: '4px solid #00ff00',
                  borderRight: '4px solid #00ff00',
                  borderRadius: '0 8px 0 0',
                  animation: 'pulse 2s infinite'
                }} />
                {/* Corner guides - bottom-left */}
                <div style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '0',
                  width: '40px',
                  height: '40px',
                  borderBottom: '4px solid #00ff00',
                  borderLeft: '4px solid #00ff00',
                  borderRadius: '0 0 0 8px',
                  animation: 'pulse 2s infinite'
                }} />
                {/* Corner guides - bottom-right */}
                <div style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  width: '40px',
                  height: '40px',
                  borderBottom: '4px solid #00ff00',
                  borderRight: '4px solid #00ff00',
                  borderRadius: '0 0 8px 0',
                  animation: 'pulse 2s infinite'
                }} />
                
                {/* Center scanning line */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '10%',
                  right: '10%',
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, #00ff00, transparent)',
                  animation: 'scanning-line 2s ease-in-out infinite'
                }} />
              </div>
              
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
            
            {/* Hidden canvas for QR processing */}
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
                <strong>🎯 Position the QR code within the corner guides</strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}>
                Hold steady and ensure good lighting for best results
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#999' }}>
                Scanner supports various QR code sizes and orientations
              </p>
            </div>
          </div>
          
          {/* CSS animation for scanning overlay */}
          <style>{`
            @keyframes pulse {
              0% { opacity: 1; }
              50% { opacity: 0.3; }
              100% { opacity: 1; }
            }
            
            @keyframes scanning-line {
              0% { transform: translateY(-20px); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateY(20px); opacity: 0; }
            }
          `}</style>
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
