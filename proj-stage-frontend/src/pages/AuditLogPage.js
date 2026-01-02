import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocumentAuditLog, getDocument } from '../services/documentService';

const AuditLogPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(50);

  useEffect(() => {
    loadData();
  }, [documentId, currentPage]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load document details and audit logs in parallel
      const [docResponse, auditResponse] = await Promise.all([
        getDocument(documentId),
        getDocumentAuditLog(documentId, currentPage, pageSize)
      ]);
      
      setDocument(docResponse);
      setAuditLogs(auditResponse.results || []);
      setTotalCount(auditResponse.count || 0);
      
    } catch (err) {
      setError(err.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeClass = (action) => {
    const classes = {
      'VIEW': 'badge-info',
      'EDIT': 'badge-warning',
      'SHARE': 'badge-success',
      'EXPORT': 'badge-secondary'
    };
    return classes[action] || 'badge-secondary';
  };

  const renderContextInfo = (context) => {
    if (!context || Object.keys(context).length === 0) {
      return null;
    }
    
    return (
      <div className="mt-2">
        <small className="text-muted">
          <strong>Details:</strong>
          {context.action && <span className="ms-2">Action: {context.action}</span>}
          {context.method && <span className="ms-2">Method: {context.method}</span>}
          {context.access_method && <span className="ms-2">Access: {context.access_method}</span>}
          {context.shared_with && <span className="ms-2">Shared with: {context.shared_with}</span>}
          {context.role_granted && <span className="ms-2">Role: {context.role_granted}</span>}
          {context.export_format && <span className="ms-2">Format: {context.export_format}</span>}
          {context.title_changed && <span className="ms-2">Title changed</span>}
          {context.content_changed && <span className="ms-2">Content changed</span>}
        </small>
      </div>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <h3>Loading audit log...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          <h4>Error Loading Audit Log</h4>
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
          <h2>📋 Audit Log</h2>
          {document && (
            <p className="text-muted mb-0">
              Document: <strong>{document.title}</strong> (ID: {document.id})
            </p>
          )}
        </div>
        <div>
          <button 
            className="btn btn-outline-secondary me-2" 
            onClick={() => navigate(`/documents/${documentId}/versions`)}
          >
            📚 Version History
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/documents')}
          >
            ← Back to Documents
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="row mb-4">
        <div className="col-md-12">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Activity Summary</h5>
              <p className="card-text">
                Total activities: <strong>{totalCount}</strong> entries
                {totalPages > 1 && (
                  <span className="ms-3">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Entries */}
      <div className="row">
        <div className="col-md-12">
          {auditLogs.length === 0 ? (
            <div className="card">
              <div className="card-body text-center">
                <h5>No audit entries found</h5>
                <p className="text-muted">This document has no recorded activities yet.</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">Activity Log</h5>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
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
                          <td>
                            <small>{formatDateTime(log.ts)}</small>
                          </td>
                          <td>
                            <div>
                              <strong>{log.actor_name || 'Unknown'}</strong>
                              {log.actor_email && (
                                <div>
                                  <small className="text-muted">{log.actor_email}</small>
                                </div>
                              )}
                              {!log.actor_user && (
                                <small className="text-muted">Anonymous</small>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${getActionBadgeClass(log.action)}`}>
                              {log.action_display || log.action}
                            </span>
                            {log.version_no && (
                              <div>
                                <small className="text-muted">Version {log.version_no}</small>
                              </div>
                            )}
                          </td>
                          <td>
                            <div>
                              {log.share_link_token && (
                                <small className="text-info">Via Share Link</small>
                              )}
                              {log.qr_link_code && (
                                <small className="text-warning">Via QR Code</small>
                              )}
                              {renderContextInfo(log.context)}
                            </div>
                          </td>
                          <td>
                            <small className="text-muted">
                              {log.ip || 'N/A'}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="row mt-4">
          <div className="col-md-12">
            <nav aria-label="Audit log pagination">
              <ul className="pagination justify-content-center">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>
                
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pageNum = Math.max(1, currentPage - 2) + i;
                  if (pageNum > totalPages) return null;
                  
                  return (
                    <li 
                      key={pageNum} 
                      className={`page-item ${currentPage === pageNum ? 'active' : ''}`}
                    >
                      <button 
                        className="page-link" 
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    </li>
                  );
                })}
                
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogPage;
