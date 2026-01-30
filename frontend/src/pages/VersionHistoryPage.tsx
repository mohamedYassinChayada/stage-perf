import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getDocumentVersionHistory,
  getDocumentVersionDetail,
  restoreDocumentVersion,
  getDocument
} from '../services/documentService';
import type { Document, Version, VersionDetail } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './DetailPage.css';

const VersionHistoryPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    loadData();
  }, [documentId]);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');

      const [docResponse, versionsResponse] = await Promise.all([
        getDocument(documentId!),
        getDocumentVersionHistory(documentId!)
      ]);

      setDocument(docResponse);
      setVersions(versionsResponse || []);

    } catch (err) {
      setError((err as Error).message || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionSelect = async (version: Version): Promise<void> => {
    try {
      setSelectedVersion(null);
      const versionDetail = await getDocumentVersionDetail(documentId!, version.id);
      setSelectedVersion(versionDetail);
      setPreviewMode(true);
    } catch (err) {
      showSnackbar(`Failed to load version details: ${(err as Error).message}`, 'error');
    }
  };

  const handleRestore = async (version: Version | VersionDetail): Promise<void> => {
    if (!window.confirm(`Are you sure you want to restore to version ${version.version_no}? This will create a new version with the restored content.`)) {
      return;
    }

    const changeNote = prompt('Optional: Enter a note about this restoration:', `Restored from version ${version.version_no}`);
    if (changeNote === null) return;

    try {
      setRestoring(true);
      await restoreDocumentVersion(documentId!, version.id, changeNote);
      showSnackbar('Document restored successfully!', 'success');

      await loadData();
      setPreviewMode(false);
      setSelectedVersion(null);

    } catch (err) {
      showSnackbar(`Failed to restore version: ${(err as Error).message}`, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const closePreview = (): void => {
    setPreviewMode(false);
    setSelectedVersion(null);
  };

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="detail-loading-spinner" />
        <p className="detail-loading-title">Loading version history</p>
        <p className="detail-loading-subtitle">Fetching document versions and change history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-error">
        <p className="detail-error-title">Failed to load version history</p>
        <p className="detail-error-message">{error}</p>
        <button className="detail-btn detail-btn--primary" onClick={() => navigate('/documents')}>Back to Documents</button>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <div className="detail-page-header-left">
          <h2>
            <span className="detail-header-icon detail-header-icon--versions">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
            </span>
            Version History
          </h2>
          {document && <p>Document: <strong>{document.title}</strong></p>}
        </div>
        <div className="detail-page-header-actions">
          <button className="detail-btn" onClick={() => navigate(`/documents/${documentId}/audit`)}>Audit Log</button>
          <button className="detail-btn" onClick={() => navigate(`/documents/${documentId}`)}>Edit Document</button>
          <button className="detail-btn detail-btn--primary" onClick={() => navigate('/documents')}>Back to Documents</button>
        </div>
      </div>

      <div className={`detail-split ${!previewMode ? 'detail-split--list-only' : ''}`}>
        <div className="detail-card">
          <div className="detail-card-header">
            <h3>Document Versions ({versions.length})</h3>
            {previewMode && (
              <button className="detail-btn detail-btn--sm" onClick={closePreview}>Close Preview</button>
            )}
          </div>
          <div className="detail-card-body--flush">
            {versions.length === 0 ? (
              <div className="detail-empty">
                <div className="detail-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
                </div>
                <p>No versions found</p>
                <p>This document has no version history yet</p>
              </div>
            ) : (
              versions.map((version) => (
                <div
                  key={version.id}
                  className={`version-item ${selectedVersion && selectedVersion.id === version.id ? 'active' : ''}`}
                  onClick={() => handleVersionSelect(version)}
                >
                  <div className="version-item-top">
                    <div className="version-item-title">
                      Version {version.version_no}
                      {document && version.version_no === document.current_version_no && (
                        <span className="detail-badge detail-badge--current">Current</span>
                      )}
                    </div>
                    <span className="version-item-date">{formatDateTime(version.created_at)}</span>
                  </div>
                  <div className="version-item-meta">
                    {version.author_name || 'Unknown'}
                    {version.author_email && ` (${version.author_email})`}
                  </div>
                  {version.change_note && (
                    <div className="version-item-note">{version.change_note}</div>
                  )}
                  {version.content_preview && (
                    <div className="version-item-note">{version.content_preview}</div>
                  )}
                  <div className="version-item-actions">
                    <button
                      className="detail-btn detail-btn--sm"
                      onClick={(e) => { e.stopPropagation(); handleVersionSelect(version); }}
                      disabled={selectedVersion?.id === version.id}
                    >
                      Preview
                    </button>
                    {document && version.version_no !== document.current_version_no && (
                      <button
                        className="detail-btn detail-btn--warning detail-btn--sm"
                        onClick={(e) => { e.stopPropagation(); handleRestore(version); }}
                        disabled={restoring}
                      >
                        {restoring ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {previewMode && selectedVersion && (
          <div className="version-preview">
            <div className="detail-card">
              <div className="detail-card-header">
                <h3>Version {selectedVersion.version_no} Preview</h3>
                <span className="detail-badge detail-badge--viewer">{formatDateTime(selectedVersion.created_at)}</span>
              </div>
              <div className="detail-card-body">
                <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#868e96', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Author</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#212529' }}>{selectedVersion.author_name || 'Unknown'}</div>
                    {selectedVersion.author_email && (
                      <div style={{ fontSize: 12, color: '#868e96' }}>{selectedVersion.author_email}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#868e96', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Created</div>
                    <div style={{ fontSize: 14, color: '#495057' }}>{formatDateTime(selectedVersion.created_at)}</div>
                  </div>
                </div>

                {selectedVersion.change_note && (
                  <div style={{ padding: '10px 14px', background: '#f8f9fa', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: '#495057' }}>Change Note: </span>
                    <span style={{ color: '#6c757d' }}>{selectedVersion.change_note}</span>
                  </div>
                )}

                <div style={{ fontSize: 11, fontWeight: 600, color: '#868e96', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8 }}>Content Preview</div>
                <div
                  className="version-preview-content"
                  dangerouslySetInnerHTML={{
                    __html: selectedVersion.html || '<p><em>No content</em></p>'
                  }}
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {document && selectedVersion.version_no !== document.current_version_no && (
                    <button
                      className="detail-btn detail-btn--warning"
                      onClick={() => handleRestore(selectedVersion)}
                      disabled={restoring}
                    >
                      {restoring ? 'Restoring...' : 'Restore This Version'}
                    </button>
                  )}
                  <button className="detail-btn" onClick={closePreview}>Close Preview</button>
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
