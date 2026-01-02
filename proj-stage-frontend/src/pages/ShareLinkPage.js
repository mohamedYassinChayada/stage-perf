import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accessDocumentViaShareLink } from '../services/documentService';
import WordLikeEditor from '../components/WordLikeEditor';

const ShareLinkPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [accessRole, setAccessRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const editorRef = useRef();

  const loadDocumentViaShareLink = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await accessDocumentViaShareLink(token);
      setDocument(response.document);
      setAccessRole(response.access_role);
    } catch (e) {
      setError(e.message || 'Failed to access document via share link');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDocumentViaShareLink();
  }, [loadDocumentViaShareLink]);

  // Set content in editor once document is loaded
  useEffect(() => {
    if (document) {
      // Function to set content with retry mechanism
      const setContentWithRetry = (retryCount = 0) => {
        const maxRetries = 5;
        const editor = editorRef.current?.getEditor();
        
        if (!editor || !editor.initialized) {
          if (retryCount < maxRetries) {
            console.log(`⏳ Editor not ready, retrying... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => setContentWithRetry(retryCount + 1), 500);
            return;
          } else {
            console.error('❌ Editor failed to initialize after maximum retries');
            return;
          }
        }

        if (document.html) {
          try {
            // Clean and validate HTML content before setting
            let cleanHtml = document.html;
            
            // Basic HTML sanitization - remove potentially problematic content
            if (typeof cleanHtml === 'string') {
              // Remove script tags and other potentially problematic elements
              cleanHtml = cleanHtml
                .replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
                .replace(/<object[^>]*>.*?<\/object>/gi, '')
                .replace(/<embed[^>]*>/gi, '');
              
              // Ensure we have valid HTML structure
              if (!cleanHtml.trim()) {
                cleanHtml = '<p>This document appears to be empty.</p>';
              }
            } else {
              cleanHtml = '<p>This document appears to be empty.</p>';
            }
            
            console.log('🔧 Setting content in ShareLinkPage:', cleanHtml.substring(0, 100) + '...');
            editor.setContent(cleanHtml);
            console.log('✅ Content set successfully in ShareLinkPage');
          } catch (error) {
            console.error('❌ Error setting content in ShareLinkPage:', error);
            // Fallback: set empty content if there's an error
            try {
              editor.setContent('<p>Error loading document content. The document may contain invalid formatting.</p>');
            } catch (fallbackError) {
              console.error('❌ Fallback content setting failed:', fallbackError);
            }
          }
        } else {
          // No HTML content, set empty message
          try {
            editor.setContent('<p>This document appears to be empty.</p>');
            console.log('📝 Set empty content message in ShareLinkPage');
          } catch (error) {
            console.error('❌ Error setting empty content:', error);
          }
        }
        
        // Set initial title
        if (editorRef.current && document.title) {
          try {
            editorRef.current.setTitle(document.title);
            console.log('📝 Title set successfully in ShareLinkPage');
          } catch (error) {
            console.error('❌ Error setting title:', error);
          }
        }
      };

      // Start the retry process after a short delay
      setTimeout(() => setContentWithRetry(), 500);
    }
  }, [document]);

  const handleSave = async () => {
    // Always prevent saving via share links
    alert('Changes cannot be saved via share links. Please log in to edit documents.');
    return;
  };

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <h3>Loading document...</h3>
        <p>Accessing document via share link</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <h3>Access Denied</h3>
        <p style={{ color: 'red' }}>{error}</p>
        <div style={{ marginTop: 16 }}>
          <p>This share link may be:</p>
          <ul style={{ textAlign: 'left', display: 'inline-block' }}>
            <li>Expired</li>
            <li>Revoked</li>
            <li>Invalid</li>
          </ul>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/auth')}
          style={{ marginTop: 16 }}
        >
          Login to Access Documents
        </button>
      </div>
    );
  }

  if (!document) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <h3>Document Not Found</h3>
        <p>The shared document could not be loaded.</p>
      </div>
    );
  }

  const isReadOnly = accessRole === 'VIEWER';

  return (
    <div style={{ padding: 16 }}>
      {/* Header with document info and access level */}
      <div style={{ 
        marginBottom: 16, 
        padding: 12, 
        backgroundColor: '#f8f9fa', 
        borderRadius: 4,
        border: '1px solid #dee2e6'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0 }}>📄 {document.title}</h4>
            <p style={{ margin: 0, fontSize: '0.9em', color: '#666' }}>
              Accessed via share link
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`badge ${
              accessRole === 'OWNER' ? 'badge-danger' : 
              accessRole === 'EDITOR' ? 'badge-warning' : 
              'badge-info'
            }`}>
              {accessRole} Access
            </span>
            {isReadOnly && (
              <div style={{ fontSize: '0.8em', color: '#666', marginTop: 4 }}>
                Read-only access
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
   
      </div>



      {/* TinyMCE Editor */}
      <div style={{ border: '1px solid #ddd', borderRadius: 4 }}>
        <WordLikeEditor
          ref={editorRef}
          initialTitle={document.title}
          initialContent={'<p>Loading document content...</p>'}
          readOnly={true}
          onSave={undefined}
        />
      </div>

      {/* Document metadata */}
      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        backgroundColor: '#f8f9fa', 
        borderRadius: 4,
        fontSize: '0.9em',
        color: '#666'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>

          <div>
            <strong>Last Updated:</strong> {document.updated_at ? new Date(document.updated_at).toLocaleString() : 'Unknown'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkPage;
