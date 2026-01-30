import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocumentAuditLog, getDocument } from '../services/documentService';
import type { Document, AuditLogEntry } from '../services/documentService';
import './DetailPage.css';

interface AuditContext {
  action?: string;
  method?: string;
  access_method?: string;
  shared_with?: string;
  role_granted?: string;
  export_format?: string;
  title_changed?: boolean;
  content_changed?: boolean;
}

const AuditLogPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(50);

  useEffect(() => {
    loadData();
  }, [documentId, currentPage]);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');

      const [docResponse, auditResponse] = await Promise.all([
        getDocument(documentId!),
        getDocumentAuditLog(documentId!, currentPage, pageSize)
      ]);

      setDocument(docResponse);
      setAuditLogs(auditResponse.results || []);
      setTotalCount(auditResponse.count || 0);

    } catch (err) {
      setError((err as Error).message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeClass = (action: string): string => {
    return `detail-badge detail-badge--${action.toLowerCase()}`;
  };

  const getActorInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const renderContextChips = (context: AuditContext | null): React.ReactNode => {
    if (!context || Object.keys(context).length === 0) return null;

    const chips: { label: string; value: string }[] = [];
    if (context.action) chips.push({ label: 'Action', value: context.action });
    if (context.method) chips.push({ label: 'Method', value: context.method });
    if (context.access_method) chips.push({ label: 'Access', value: context.access_method });
    if (context.shared_with) chips.push({ label: 'Shared with', value: context.shared_with });
    if (context.role_granted) chips.push({ label: 'Role', value: context.role_granted });
    if (context.export_format) chips.push({ label: 'Format', value: context.export_format });
    if (context.title_changed) chips.push({ label: 'Change', value: 'Title' });
    if (context.content_changed) chips.push({ label: 'Change', value: 'Content' });

    if (chips.length === 0) return null;

    return (
      <div className="audit-details">
        {chips.map((chip, i) => (
          <span key={i} className="audit-detail-chip">
            <strong>{chip.label}:</strong> {chip.value}
          </span>
        ))}
      </div>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="detail-loading-spinner" />
        <p className="detail-loading-title">Loading audit log</p>
        <p className="detail-loading-subtitle">Fetching activity history and access records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-error">
        <p className="detail-error-title">Failed to load audit log</p>
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
            <span className="detail-header-icon detail-header-icon--audit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </span>
            Audit Log
          </h2>
          {document && <p>Document: <strong>{document.title}</strong></p>}
        </div>
        <div className="detail-page-header-actions">
          <button className="detail-btn" onClick={() => navigate(`/documents/${documentId}/versions`)}>Version History</button>
          <button className="detail-btn detail-btn--primary" onClick={() => navigate('/documents')}>Back to Documents</button>
        </div>
      </div>

      <div className="detail-card" style={{ marginBottom: 20 }}>
        <div className="detail-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div style={{ fontSize: 14, color: '#495057' }}>
            Total activities: <strong>{totalCount}</strong> entries
          </div>
          {totalPages > 1 && (
            <div style={{ fontSize: 13, color: '#868e96' }}>
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-header">
          <h3>Activity Log</h3>
        </div>
        {auditLogs.length === 0 ? (
          <div className="detail-empty">
            <div className="detail-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <p>No audit entries found</p>
            <p>This document has no recorded activities yet</p>
          </div>
        ) : (
          <div className="detail-card-body--flush">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12, color: '#868e96', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.ts)}
                    </td>
                    <td>
                      <div className="audit-row-actor">
                        <div className={`audit-row-avatar ${!log.actor_user ? 'audit-row-avatar--anon' : ''}`}>
                          {getActorInitials(log.actor_name)}
                        </div>
                        <div>
                          <div className="audit-row-name">{log.actor_name || 'Unknown'}</div>
                          {log.actor_email && <div className="audit-row-email">{log.actor_email}</div>}
                          {!log.actor_user && <div className="audit-row-email">Anonymous</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={getActionBadgeClass(log.action)}>
                        {log.action_display || log.action}
                      </span>
                      {log.version_no && (
                        <div style={{ fontSize: 11, color: '#868e96', marginTop: 4 }}>Version {log.version_no}</div>
                      )}
                    </td>
                    <td>
                      <div>
                        {log.share_link_token && (
                          <span className="audit-detail-chip">
                            <strong>Via:</strong> Share Link
                          </span>
                        )}
                        {log.qr_link_code && (
                          <span className="audit-detail-chip">
                            <strong>Via:</strong> QR Code
                          </span>
                        )}
                        {renderContextChips(log.context as AuditContext)}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: '#868e96', fontFamily: "'SFMono-Regular', Consolas, monospace" }}>
                        {log.ip || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 20 }}>
          <button
            className="detail-btn detail-btn--sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            First
          </button>
          <button
            className="detail-btn detail-btn--sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const pageNum = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
            if (pageNum > totalPages || pageNum < 1) return null;
            return (
              <button
                key={pageNum}
                className={`detail-btn detail-btn--sm ${currentPage === pageNum ? 'detail-btn--primary' : ''}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            className="detail-btn detail-btn--sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
          <button
            className="detail-btn detail-btn--sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditLogPage;
