import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  listShares, addShare, deleteShare, getDocument, listUsers,
  listGroups, getDocumentShareLinks, createShareLink, revokeShareLink
} from '../services/documentService';

const AccessManagementPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [shares, setShares] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ subject_type: 'user', subject_id: '', role: 'VIEWER', expires_at: '' });
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [shareLinkForm, setShareLinkForm] = useState({ role: 'VIEWER', expires_at: '' });
  const [showShareLinks, setShowShareLinks] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [d, s, u, g, sl] = await Promise.all([
        getDocument(id),
        listShares(id),
        listUsers(),
        listGroups(),
        getDocumentShareLinks(id).catch(() => []) // Graceful fallback if share links fail
      ]);
      setDoc(d);
      setShares(s);
      setUsers(u);
      setGroups(g);
      setShareLinks(sl);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onAdd = async (e) => {
    e.preventDefault();
    try {
      await addShare(id, form.subject_type, form.subject_id, form.role, form.expires_at || null);
      setForm({ subject_type: 'user', subject_id: '', role: 'VIEWER', expires_at: '' });
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const onDelete = async (shareId) => {
    if (!window.confirm('Remove access?')) return;
    try { await deleteShare(shareId); await load(); } catch (e) { alert(e.message); }
  };

  const onCreateShareLink = async (e) => {
    e.preventDefault();
    try {
      const expiresAt = shareLinkForm.expires_at || null;
      await createShareLink(id, shareLinkForm.role, expiresAt);
      setShareLinkForm({ role: 'VIEWER', expires_at: '' });
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const onRevokeShareLink = async (shareLinkId) => {
    if (!window.confirm('Revoke this share link?')) return;
    try { 
      await revokeShareLink(shareLinkId); 
      await load(); 
    } catch (e) { 
      alert(e.message); 
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy to clipboard');
    });
  };

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>Manage Access: {doc?.title}</h2>
      <button className="btn btn-secondary" onClick={() => navigate('/documents')}>Back</button>
      
      {/* Navigation Tabs */}
      <div style={{ marginTop: 16, borderBottom: '1px solid #ccc' }}>
        <button 
          className={`btn ${!showShareLinks ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setShowShareLinks(false)}
          style={{ marginRight: 8 }}
        >
          User & Group Access
        </button>
        <button 
          className={`btn ${showShareLinks ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setShowShareLinks(true)}
        >
          Share Links
        </button>
      </div>

      {!showShareLinks ? (
        // User and Group Access Tab
        <div>
          <h3 style={{ marginTop: 16 }}>Current Access</h3>
          {shares.length === 0 ? (
            <div>No users/groups have access.</div>
          ) : (
            <table style={{ width: '100%', marginTop: 8 }}>
              <thead>
                <tr><th>Type</th><th>Subject</th><th>Role</th><th>Expires</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {shares.map(s => (
                  <tr key={s.id}>
                    <td style={{ textTransform: 'capitalize' }}>{s.subject_type}</td>
                    <td>
                      {s.subject_type === 'user' 
                        ? users.find(u => u.id === parseInt(s.subject_id))?.username || `User #${s.subject_id}`
                        : groups.find(g => g.id === s.subject_id)?.name || `Group #${s.subject_id}`
                      }
                    </td>
                    <td><span className={`badge ${s.role === 'OWNER' ? 'badge-danger' : s.role === 'EDITOR' ? 'badge-warning' : 'badge-info'}`}>{s.role}</span></td>
                    <td>{s.expires_at ? new Date(s.expires_at).toLocaleString() : 'Never'}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => onDelete(s.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ marginTop: 24 }}>Add Access</h3>
          <form onSubmit={onAdd} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={form.subject_type} onChange={e => setForm(f => ({ ...f, subject_type: e.target.value, subject_id: '' }))}>
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
            
            {form.subject_type === 'user' ? (
              <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} required>
                <option value="">Select user…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                ))}
              </select>
            ) : (
              <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} required>
                <option value="">Select group…</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.member_count} members)</option>
                ))}
              </select>
            )}
            
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="OWNER">Owner</option>
            </select>
            
            <input 
              type="datetime-local" 
              value={form.expires_at} 
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              placeholder="Optional expiry"
            />
            
            <button className="btn btn-primary" type="submit">Add Access</button>
          </form>
        </div>
      ) : (
        // Share Links Tab
        <div>
          <h3 style={{ marginTop: 16 }}>Share Links</h3>
          <p>Create public links that allow access to this document without requiring user accounts.</p>
          
          {shareLinks.length === 0 ? (
            <div>No share links created.</div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {shareLinks.map(sl => (
                <div key={sl.id} style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: 4, 
                  padding: 12, 
                  marginBottom: 8,
                  backgroundColor: sl.is_revoked ? '#f8f8f8' : sl.is_expired ? '#fff3cd' : '#f8fff8'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Role:</strong> <span className={`badge ${sl.role === 'OWNER' ? 'badge-danger' : sl.role === 'EDITOR' ? 'badge-warning' : 'badge-info'}`}>{sl.role}</span>
                      {sl.expires_at && (
                        <span style={{ marginLeft: 16 }}>
                          <strong>Expires:</strong> {new Date(sl.expires_at).toLocaleString()}
                        </span>
                      )}
                      {sl.is_revoked && <span style={{ marginLeft: 16, color: 'red' }}>(Revoked)</span>}
                      {sl.is_expired && <span style={{ marginLeft: 16, color: 'orange' }}>(Expired)</span>}
                    </div>
                    <div>
                      {!sl.is_revoked && !sl.is_expired && (
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => copyToClipboard(`${window.location.origin}/share/${sl.token}`)}
                          style={{ marginRight: 8 }}
                        >
                          Copy Link
                        </button>
                      )}
                      {!sl.is_revoked && (
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => onRevokeShareLink(sl.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.9em', color: '#666' }}>
                    <strong>Link:</strong> 
                    <code style={{ marginLeft: 8, padding: '2px 4px', backgroundColor: '#f1f1f1' }}>
                      {window.location.origin}/share/{sl.token}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ marginTop: 24 }}>Create New Share Link</h4>
          <form onSubmit={onCreateShareLink} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select 
              value={shareLinkForm.role} 
              onChange={e => setShareLinkForm(f => ({ ...f, role: e.target.value }))}
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="OWNER">Owner</option>
            </select>
            
            <input 
              type="datetime-local" 
              value={shareLinkForm.expires_at} 
              onChange={e => setShareLinkForm(f => ({ ...f, expires_at: e.target.value }))}
              placeholder="Optional expiry"
            />
            
            <button className="btn btn-success" type="submit">Create Share Link</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AccessManagementPage;


