import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  listShares, addShare, deleteShare, getDocument, listUsers,
  listGroups, getDocumentShareLinks, createShareLink, revokeShareLink
} from '../services/documentService';
import type { Document, Share, User, Group, ShareLink } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './DetailPage.css';

interface AccessForm {
  subject_type: 'user' | 'group';
  subject_id: string;
  role: string;
  expires_at: string;
}

interface ShareLinkForm {
  role: string;
  expires_at: string;
}

const AccessManagementPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AccessForm>({ subject_type: 'user', subject_id: '', role: 'VIEWER', expires_at: '' });
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [shareLinkForm, setShareLinkForm] = useState<ShareLinkForm>({ role: 'VIEWER', expires_at: '' });
  const [activeTab, setActiveTab] = useState<'access' | 'links'>('access');

  const load = async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      const [d, s, u, g, sl] = await Promise.all([
        getDocument(id!),
        listShares(id!),
        listUsers(),
        listGroups(),
        getDocumentShareLinks(id!).catch(() => [])
      ]);
      setDoc(d);
      setShares(s);
      setUsers(u);
      setGroups(g);
      setShareLinks(sl);
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const onAdd = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      await addShare(id!, form.subject_type, form.subject_id, form.role, form.expires_at || undefined);
      showSnackbar('Access added successfully!', 'success');
      setForm({ subject_type: 'user', subject_id: '', role: 'VIEWER', expires_at: '' });
      await load();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to add access', 'error');
    }
  };

  const onDelete = async (shareId: number): Promise<void> => {
    if (!window.confirm('Remove this access entry?')) return;
    try {
      await deleteShare(shareId);
      showSnackbar('Access removed', 'success');
      await load();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to remove access', 'error');
    }
  };

  const onCreateShareLink = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      await createShareLink(id!, shareLinkForm.role, shareLinkForm.expires_at || undefined);
      showSnackbar('Share link created!', 'success');
      setShareLinkForm({ role: 'VIEWER', expires_at: '' });
      await load();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to create share link', 'error');
    }
  };

  const onRevokeShareLink = async (shareLinkId: string): Promise<void> => {
    if (!window.confirm('Revoke this share link?')) return;
    try {
      await revokeShareLink(shareLinkId);
      showSnackbar('Share link revoked', 'success');
      await load();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to revoke share link', 'error');
    }
  };

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text).then(() => {
      showSnackbar('Link copied to clipboard!', 'success');
    }).catch(() => {
      showSnackbar('Failed to copy to clipboard', 'error');
    });
  };

  const getRoleBadgeClass = (role: string): string => {
    return `detail-badge detail-badge--${role.toLowerCase()}`;
  };

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="detail-loading-spinner" />
        <p className="detail-loading-title">Loading access settings</p>
        <p className="detail-loading-subtitle">Fetching permissions, users, and share links...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-error">
        <p className="detail-error-title">Failed to load access settings</p>
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
            <span className="detail-header-icon detail-header-icon--access">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
            Manage Access
          </h2>
          {doc && <p>Document: <strong>{doc.title}</strong></p>}
        </div>
        <div className="detail-page-header-actions">
          <button className="detail-btn" onClick={() => navigate(`/documents/${id}`)}>Edit Document</button>
          <button className="detail-btn detail-btn--primary" onClick={() => navigate('/documents')}>Back to Documents</button>
        </div>
      </div>

      <div className="detail-tabs">
        <button className={`detail-tab ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>
          User & Group Access
        </button>
        <button className={`detail-tab ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>
          Share Links ({shareLinks.length})
        </button>
      </div>

      {activeTab === 'access' ? (
        <>
          <div className="detail-card">
            <div className="detail-card-header">
              <h3>Current Access ({shares.length})</h3>
            </div>
            {shares.length === 0 ? (
              <div className="detail-empty">
                <div className="detail-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <p>No users or groups have access</p>
                <p>Add access using the form below</p>
              </div>
            ) : (
              <div className="detail-card-body--flush">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shares.map(s => (
                      <tr key={s.id}>
                        <td style={{ textTransform: 'capitalize' }}>{s.subject_type}</td>
                        <td style={{ fontWeight: 500 }}>
                          {s.subject_type === 'user'
                            ? users.find(u => u.id === parseInt(s.subject_id))?.username || `User #${s.subject_id}`
                            : groups.find(g => g.id === parseInt(s.subject_id))?.name || `Group #${s.subject_id}`
                          }
                        </td>
                        <td><span className={getRoleBadgeClass(s.role)}>{s.role}</span></td>
                        <td style={{ fontSize: 12, color: '#868e96' }}>{s.expires_at ? new Date(s.expires_at).toLocaleString() : 'Never'}</td>
                        <td>
                          <button className="detail-btn detail-btn--danger detail-btn--sm" onClick={() => onDelete(s.id)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h3>Add Access</h3>
            </div>
            <div className="detail-card-body">
              <form onSubmit={onAdd} className="detail-form">
                <div className="detail-form-group">
                  <label>Type</label>
                  <select value={form.subject_type} onChange={e => setForm(f => ({ ...f, subject_type: e.target.value as 'user' | 'group', subject_id: '' }))}>
                    <option value="user">User</option>
                    <option value="group">Group</option>
                  </select>
                </div>
                <div className="detail-form-group" style={{ flex: 1 }}>
                  <label>{form.subject_type === 'user' ? 'User' : 'Group'}</label>
                  {form.subject_type === 'user' ? (
                    <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} required>
                      <option value="">Select user...</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
                    </select>
                  ) : (
                    <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} required>
                      <option value="">Select group...</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count} members)</option>)}
                    </select>
                  )}
                </div>
                <div className="detail-form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </div>
                <div className="detail-form-group">
                  <label>Expires (optional)</label>
                  <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
                <button className="detail-btn detail-btn--primary" type="submit" style={{ alignSelf: 'flex-end' }}>Add Access</button>
              </form>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="detail-card">
            <div className="detail-card-header">
              <h3>Share Links</h3>
            </div>
            <div className="detail-card-body">
              {shareLinks.length === 0 ? (
                <div className="detail-empty">
                  <div className="detail-empty-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <p>No share links created</p>
                  <p>Create a public link to share this document</p>
                </div>
              ) : (
                shareLinks.map(sl => (
                  <div key={sl.id} className={`share-link-card ${sl.is_revoked ? 'share-link-card--revoked' : sl.is_expired ? 'share-link-card--expired' : 'share-link-card--active'}`}>
                    <div className="share-link-card-top">
                      <div className="share-link-card-info">
                        <span className={getRoleBadgeClass(sl.role)}>{sl.role}</span>
                        {sl.expires_at && (
                          <span style={{ fontSize: 12, color: '#868e96' }}>Expires: {new Date(sl.expires_at).toLocaleString()}</span>
                        )}
                        {sl.is_revoked && <span className="detail-badge detail-badge--revoked">Revoked</span>}
                        {sl.is_expired && <span className="detail-badge detail-badge--expired">Expired</span>}
                      </div>
                      <div className="share-link-card-actions">
                        {!sl.is_revoked && !sl.is_expired && (
                          <button className="detail-btn detail-btn--sm" onClick={() => copyToClipboard(`${window.location.origin}/share/${sl.token}`)}>
                            Copy Link
                          </button>
                        )}
                        {!sl.is_revoked && (
                          <button className="detail-btn detail-btn--danger detail-btn--sm" onClick={() => onRevokeShareLink(sl.id)}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="share-link-url">
                      {window.location.origin}/share/{sl.token}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h3>Create New Share Link</h3>
            </div>
            <div className="detail-card-body">
              <form onSubmit={onCreateShareLink} className="detail-form">
                <div className="detail-form-group">
                  <label>Role</label>
                  <select value={shareLinkForm.role} onChange={e => setShareLinkForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </div>
                <div className="detail-form-group">
                  <label>Expires (optional)</label>
                  <input type="datetime-local" value={shareLinkForm.expires_at} onChange={e => setShareLinkForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
                <button className="detail-btn detail-btn--success" type="submit" style={{ alignSelf: 'flex-end' }}>Create Share Link</button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AccessManagementPage;
