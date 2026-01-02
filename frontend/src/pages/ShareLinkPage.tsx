import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accessDocumentViaShareLink } from '../services/documentService';
import type { Document } from '../services/documentService';
import WordLikeEditor from '../components/WordLikeEditor';
import type { WordLikeEditorHandle } from '../components/WordLikeEditor';

const ShareLinkPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [accessRole, setAccessRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const editorRef = useRef<WordLikeEditorHandle>(null);

  const loadDocumentViaShareLink = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      const response = await accessDocumentViaShareLink(token!);
      setDocument(response.document);
      setAccessRole(response.access_role);
    } catch (e) {
      setError((e as Error).message || 'Failed to access document via share link');
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
      const setContentWithRetry = (retryCount: number = 0): void => {
        const maxRetries = 5;
        const editor = editorRef.current?.getEditor();
        
        if (!editor) {
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
            let cleanHtml = document.html;
            
            if (typeof cleanHtml === 'string') {
              cleanHtml = cleanHtml
                .replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
                .replace(/<object[^>]*>.*?<\/object>/gi, '')
                .replace(/<embed[^>]*>/gi, '');
              
              if (!cleanHtml.trim()) {
                cleanHtml = '<p>This document appears to be empty.</p>';
              }
            } else {
              cleanHtml = '<p>This document appears to be empty.</p>';
            }
            
            console.log('🔧 Setting content in ShareLinkPage');
            editor.setContent(cleanHtml);
            console.log('✅ Content set successfully in ShareLinkPage');
          } catch (err) {
            console.error('❌ Error setting content in ShareLinkPage:', err);
            try {
              editor.setContent('<p>Error loading document content. The document may contain invalid formatting.</p>');
            } catch (fallbackError) {
              console.error('❌ Fallback content setting failed:', fallbackError);
            }
          }
        } else {
          try {
            editor.setContent('<p>This document appears to be empty.</p>');
          } catch (err) {
            console.error('❌ Error setting empty content:', err);
          }
        }
        
        if (editorRef.current && document.title) {
          try {
            editorRef.current.setTitle(document.title);
          } catch (err) {
            console.error('❌ Error setting title:', err);
          }
        }
      };

      setTimeout(() => setContentWithRetry(), 500);
    }
  }, [document]);

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

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 4 }}>
        <WordLikeEditor
          ref={editorRef}
          initialTitle={document.title}
          readOnly={true}
        />
      </div>

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
