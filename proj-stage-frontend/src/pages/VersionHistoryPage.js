import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getDocumentVersionHistory, 
  getDocumentVersionDetail, 
  restoreDocumentVersion, 
  getDocument 
} from '../services/documentService';

const VersionHistoryPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    loadData();
  }, [documentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load document details and version history in parallel
      const [docResponse, versionsResponse] = await Promise.all([
        getDocument(documentId),
        getDocumentVersionHistory(documentId)
      ]);
      
      setDocument(docResponse);
      setVersions(versionsResponse || []);
      
    } catch (err) {
      setError(err.message || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionSelect = async (version) => {
    try {
      setSelectedVersion(null);
      const versionDetail = await getDocumentVersionDetail(documentId, version.id);
      setSelectedVersion(versionDetail);
      setPreviewMode(true);
    } catch (err) {
      alert(`Failed to load version details: ${err.message}`);
    }
  };

  const handleRestore = async (version) => {
    if (!window.confirm(`Are you sure you want to restore to version ${version.version_no}? This will create a new version with the restored content.`)) {
      return;
    }

    const changeNote = prompt('Optional: Enter a note about this restoration:', `Restored from version ${version.version_no}`);
    if (changeNote === null) return; // User cancelled

    try {
      setRestoring(true);
      await restoreDocumentVersion(documentId, version.id, changeNote);
      alert('Document restored successfully! The page will reload to show the updated document.');
      
      // Reload the data to show the new version
      await loadData();
      setPreviewMode(false);
      setSelectedVersion(null);
      
    } catch (err) {
      alert(`Failed to restore version: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const closePreview = () => {
    setPreviewMode(false);
    setSelectedVersion(null);
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <h3>Loading version history...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          <h4>Error Loading Version History</h4>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/documents')}>
            ← Back to Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2>📚 Version History</h2>
          {document && (
            <p className="text-muted mb-0">
              Document: <strong>{document.title}</strong> (ID: {document.id})
            </p>
          )}
        </div>
        <div>
          <button 
            className="btn btn-outline-secondary me-2" 
            onClick={() => navigate(`/documents/${documentId}/audit`)}
          >
            📋 Audit Log
          </button>
          <button 
            className="btn btn-outline-primary me-2" 
            onClick={() => navigate(`/documents/${documentId}/edit`)}
          >
            ✏️ Edit Document
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/documents')}
          >
            ← Back to Documents
          </button>
        </div>
      </div>

      <div className="row">
        {/* Version List */}
        <div className={`col-md-${previewMode ? '4' : '12'}`}>
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">
                Document Versions ({versions.length})
                {previewMode && (
                  <button 
                    className="btn btn-sm btn-outline-secondary float-end"
                    onClick={closePreview}
                  >
                    ✕ Close Preview
                  </button>
                )}
              </h5>
            </div>
            <div className="card-body p-0">
              {versions.length === 0 ? (
                <div className="p-4 text-center">
                  <h6>No versions found</h6>
                  <p className="text-muted">This document has no version history yet.</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {versions.map((version) => (
                    <div 
                      key={version.id} 
                      className={`list-group-item list-group-item-action ${
                        selectedVersion && selectedVersion.id === version.id ? 'active' : ''
                      }`}
                    >
                      <div className="d-flex w-100 justify-content-between">
                        <h6 className="mb-1">
                          Version {version.version_no}
                          {document && version.version_no === document.current_version_no && (
                            <span className="badge bg-primary ms-2">Current</span>
                          )}
                        </h6>
                        <small>{formatDateTime(version.created_at)}</small>
                      </div>
                      
                      <div className="mb-2">
                        <small>
                          <strong>Author:</strong> {version.author_name || 'Unknown'}
                          {version.author_email && ` (${version.author_email})`}
                        </small>
                      </div>
                      
                      {version.change_note && (
                        <div className="mb-2">
                          <small className="text-muted">
                            <strong>Note:</strong> {version.change_note}
                          </small>
                        </div>
                      )}
                      
                      {version.content_preview && (
                        <div className="mb-2">
                          <small className="text-muted">
                            <strong>Preview:</strong> {version.content_preview}
                          </small>
                        </div>
                      )}
                      
                      <div className="btn-group btn-group-sm" role="group">
                        <button 
                          className="btn btn-outline-primary" 
                          onClick={() => handleVersionSelect(version)}
                          disabled={selectedVersion && selectedVersion.id === version.id}
                        >
                          👁️ Preview
                        </button>
                        {document && version.version_no !== document.current_version_no && (
                          <button 
                            className="btn btn-outline-warning" 
                            onClick={() => handleRestore(version)}
                            disabled={restoring}
                          >
                            {restoring ? '⏳' : '↩️'} Restore
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Version Preview */}
        {previewMode && selectedVersion && (
          <div className="col-md-8">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">
                  Version {selectedVersion.version_no} Preview
                  <span className="badge bg-info ms-2">{formatDateTime(selectedVersion.created_at)}</span>
                </h5>
              </div>
              <div className="card-body">
                {/* Version Metadata */}
                <div className="row mb-3">
                  <div className="col-md-6">
                    <strong>Author:</strong> {selectedVersion.author_name || 'Unknown'}
                    {selectedVersion.author_email && (
                      <div><small className="text-muted">{selectedVersion.author_email}</small></div>
                    )}
                  </div>
                  <div className="col-md-6">
                    <strong>Created:</strong> {formatDateTime(selectedVersion.created_at)}
                  </div>
                </div>
                
                {selectedVersion.change_note && (
                  <div className="mb-3">
                    <strong>Change Note:</strong>
                    <div className="text-muted">{selectedVersion.change_note}</div>
                  </div>
                )}
                
                <hr />
                
                {/* Content Preview */}
                <div className="mb-3">
                  <strong>Content Preview:</strong>
                </div>
                
                <div 
                  className="border p-3 bg-light"
                  style={{ 
                    maxHeight: '500px', 
                    overflowY: 'auto',
                    fontFamily: 'serif',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: selectedVersion.html || '<p><em>No content</em></p>' 
                  }}
                />
                
                {/* Action Buttons */}
                <div className="mt-3">
                  {document && selectedVersion.version_no !== document.current_version_no && (
                    <button 
                      className="btn btn-warning me-2" 
                      onClick={() => handleRestore(selectedVersion)}
                      disabled={restoring}
                    >
                      {restoring ? '⏳ Restoring...' : '↩️ Restore This Version'}
                    </button>
                  )}
                  <button 
                    className="btn btn-outline-secondary" 
                    onClick={closePreview}
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionHistoryPage;
