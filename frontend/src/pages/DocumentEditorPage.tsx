import React, { useEffect, useRef, useState } from 'react';
import WordLikeEditor from '../components/WordLikeEditor';
import type { WordLikeEditorHandle } from '../components/WordLikeEditor';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, updateDocumentHtml } from '../services/documentService';
import type { Document } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';

const DocumentEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<WordLikeEditorHandle>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [saving, setSaving] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDocument(id!);
        setDoc(d);
        
        // Check user permissions and set read-only mode
        console.log('📋 Document permissions:', {
          user_role: d.user_role,
          user_permissions: d.user_permissions,
          canEdit: d.user_permissions?.includes('EDIT')
        });
        
        const canEdit = d.user_permissions && d.user_permissions.includes('EDIT');
        const readOnly = !canEdit;
        setIsReadOnly(readOnly);
        
        if (readOnly) {
          console.log('🔒 Document is READ-ONLY for current user');
        } else {
          console.log('✏️ Document is EDITABLE for current user');
        }
        
        // Load existing HTML into editor with proper page management integration
        setTimeout(() => {
          if (editorRef.current && d.html) {
            console.log('📄 Loading document content into WordLikeEditor...');
            
            // Use the enhanced setContent method that properly handles page management
            editorRef.current.setContent(d.html);
            
            console.log('✅ Document content loaded with page management integration');
          }
          
          // Set initial title
          if (editorRef.current && d.title) {
            editorRef.current.setTitle(d.title);
          }
        }, 800); // Increased timeout to ensure editor is fully ready
      } catch (e) {
        console.error('Error loading document:', e);
        showSnackbar('Failed to load document: ' + (e as Error).message, 'error');
        navigate('/documents');
      }
    })();
  }, [id, navigate]);

  const onSave = async (): Promise<void> => {
    if (!editorRef.current || isReadOnly) {
      if (isReadOnly) {
        showSnackbar('Cannot save - you only have view access to this document', 'error');
      }
      return;
    }
    try {
      setSaving(true);
      const html = editorRef.current.getContent();
      const title = editorRef.current.getTitle() || doc!.title;
      const updated = await updateDocumentHtml(id!, title, html);
      setDoc(updated);
      showSnackbar('Document saved successfully!', 'success');
    } catch (e) {
      console.error('Save failed:', e);
      showSnackbar('Save failed: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!doc) return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 48,
        height: 48,
        border: '4px solid #e9ecef',
        borderTop: '4px solid #667eea',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        marginBottom: 20,
      }} />
      <p style={{
        fontSize: '1.1rem',
        fontWeight: 600,
        color: '#1a202c',
        margin: '0 0 6px 0',
      }}>
        Opening document
      </p>
      <p style={{
        fontSize: '0.85rem',
        color: '#6c757d',
        margin: 0,
      }}>
        Loading content and preparing the editor...
      </p>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
  
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2>{doc.title}</h2>
        {isReadOnly && (
          <span 
            style={{ 
              backgroundColor: '#f8d7da', 
              color: '#721c24', 
              padding: '4px 8px', 
              borderRadius: '4px', 
              fontSize: '12px',
              fontWeight: 'bold',
              border: '1px solid #f5c6cb'
            }}
          >
            🔒 READ ONLY
          </span>
        )}
        {doc.user_role && (
          <span 
            style={{ 
              backgroundColor: '#d4edda', 
              color: '#155724', 
              padding: '4px 8px', 
              borderRadius: '4px', 
              fontSize: '12px',
              fontWeight: 'bold',
              border: '1px solid #c3e6cb'
            }}
          >
            Role: {doc.user_role}
          </span>
        )}
      </div>
      
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button 
          className="btn btn-primary" 
          style={{ padding: '10px 24px', fontSize: '15px', fontWeight: 600 }}
          onClick={() => navigate('/documents')}
        >
          ← Back
        </button>
        {!isReadOnly && (
          <button 
            className="btn btn-success" 
            onClick={onSave} 
            disabled={saving}
            title="Save document"
            style={{ padding: '10px 20px' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {isReadOnly && (
          <div style={{ 
            marginTop: 8, 
            padding: '8px 12px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffeaa7', 
            borderRadius: '4px',
            fontSize: '14px',
            color: '#856404'
          }}>
            ℹ️ You have <strong>{doc.user_role}</strong> access to this document. 
            {doc.user_role === 'VIEWER' && ' You can only view the content.'}
          </div>
        )}
      </div>
      
      <WordLikeEditor 
        ref={editorRef} 
        initialTitle={doc.title} 
        readOnly={isReadOnly}
        qrCodeUrl={doc.qr_code_url}
      />
    </div>
  );
};

export default DocumentEditorPage;
