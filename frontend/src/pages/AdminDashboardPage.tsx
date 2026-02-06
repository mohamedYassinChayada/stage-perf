import React, { useState, useEffect } from 'react';
import {
  adminGetUsers, adminApproveUser, adminRejectUser, adminDeleteUser,
  adminResendVerification, adminGetACLs, adminUpdateACL, adminDeleteACL,
  adminGetDashboardStats,
} from '../services/documentService';
import type { AdminUser, AdminACL, DashboardStats } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './AdminDashboardPage.css';

type Tab = 'dashboard' | 'users' | 'acl';
type UserStatusTab = 'all' | 'pending_verification' | 'pending_approval' | 'approved' | 'rejected';

const AdminDashboardPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Users</button>
          <button className={`admin-tab ${tab === 'acl' ? 'active' : ''}`} onClick={() => setTab('acl')}>ACL Management</button>
        </div>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'acl' && <ACLTab />}
    </div>
  );
};

const DashboardTab: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGetDashboardStats();
        setStats(data);
      } catch {
        showSnackbar('Failed to load dashboard stats', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="admin-loading">Loading dashboard...</div>;
  if (!stats) return <div className="admin-loading">Failed to load stats</div>;

  return (
    <div className="dashboard-content">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total_users}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_documents}</div>
          <div className="stat-label">Total Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_acls}</div>
          <div className="stat-label">Total ACLs</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-value">{stats.users_by_status?.pending_approval || 0}</div>
          <div className="stat-label">Pending Approval</div>
        </div>
      </div>

      <div className="dashboard-sections">
        <div className="dashboard-section">
          <h3>Recent Registrations</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_registrations.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td><span className={`status-badge status-${u.approval_status}`}>{u.approval_status}</span></td>
                    <td>{new Date(u.date_joined).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-section">
          <h3>Recent Activity</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>User</th>
                  <th>Document</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_activity.map(a => (
                  <tr key={a.id}>
                    <td>{a.action_display || a.action}</td>
                    <td>{a.actor_name || 'System'}</td>
                    <td>{a.context && typeof a.context === 'object' && 'document_title' in a.context ? String(a.context.document_title) : '-'}</td>
                    <td>{new Date(a.ts).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<UserStatusTab>('all');
  const [rejectModal, setRejectModal] = useState<{ userId: number; username: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const filter = statusTab === 'all' ? undefined : statusTab;
      const data = await adminGetUsers(filter);
      setUsers(data);
    } catch {
      showSnackbar('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [statusTab]);

  const handleApprove = async (userId: number) => {
    try {
      await adminApproveUser(userId);
      showSnackbar('User approved', 'success');
      fetchUsers();
    } catch { showSnackbar('Failed to approve user', 'error'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await adminRejectUser(rejectModal.userId, rejectReason);
      showSnackbar('User rejected', 'success');
      setRejectModal(null);
      setRejectReason('');
      fetchUsers();
    } catch { showSnackbar('Failed to reject user', 'error'); }
  };

  const handleDelete = async (userId: number, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await adminDeleteUser(userId);
      showSnackbar('User deleted', 'success');
      fetchUsers();
    } catch { showSnackbar('Failed to delete user', 'error'); }
  };

  const handleResend = async (userId: number) => {
    try {
      await adminResendVerification(userId);
      showSnackbar('Verification email resent', 'success');
    } catch { showSnackbar('Failed to resend verification', 'error'); }
  };

  const statusTabs: { key: UserStatusTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending_verification', label: 'Pending Verification' },
    { key: 'pending_approval', label: 'Pending Approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="users-content">
      <div className="user-status-tabs">
        {statusTabs.map(t => (
          <button
            key={t.key}
            className={`user-status-tab ${statusTab === t.key ? 'active' : ''}`}
            onClick={() => setStatusTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-loading">Loading users...</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Status</th>
                <th>Email Verified</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username} {u.is_superuser && <span className="admin-badge">Admin</span>}</td>
                  <td>{u.email}</td>
                  <td><span className={`status-badge status-${u.approval_status}`}>{u.approval_status}</span></td>
                  <td>{u.email_verified ? 'Yes' : 'No'}</td>
                  <td>{new Date(u.date_joined).toLocaleDateString()}</td>
                  <td className="action-cell">
                    {u.approval_status === 'pending_approval' && (
                      <>
                        <button className="action-btn approve" onClick={() => handleApprove(u.id)}>Approve</button>
                        <button className="action-btn reject" onClick={() => setRejectModal({ userId: u.id, username: u.username })}>Reject</button>
                      </>
                    )}
                    {u.approval_status === 'pending_verification' && (
                      <button className="action-btn resend" onClick={() => handleResend(u.id)}>Resend</button>
                    )}
                    {!u.is_superuser && (
                      <button className="action-btn delete" onClick={() => handleDelete(u.id, u.username)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Reject User: {rejectModal.username}</h3>
            <div className="modal-field">
              <label>Reason (optional)</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="action-btn reject" onClick={handleReject}>Reject User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ACLTab: React.FC = () => {
  const [acls, setACLs] = useState<AdminACL[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingACL, setEditingACL] = useState<AdminACL | null>(null);
  const [editRole, setEditRole] = useState('');

  const fetchACLs = async () => {
    setLoading(true);
    try {
      const data = await adminGetACLs();
      setACLs(data);
    } catch {
      showSnackbar('Failed to load ACLs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchACLs(); }, []);

  const handleUpdateRole = async () => {
    if (!editingACL) return;
    try {
      await adminUpdateACL(editingACL.id, { role: editRole });
      showSnackbar('ACL updated', 'success');
      setEditingACL(null);
      fetchACLs();
    } catch { showSnackbar('Failed to update ACL', 'error'); }
  };

  const handleDelete = async (aclId: string) => {
    if (!confirm('Delete this ACL entry?')) return;
    try {
      await adminDeleteACL(aclId);
      showSnackbar('ACL deleted', 'success');
      fetchACLs();
    } catch { showSnackbar('Failed to delete ACL', 'error'); }
  };

  return (
    <div className="acl-content">
      {loading ? (
        <div className="admin-loading">Loading ACLs...</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Subject Type</th>
                <th>Subject</th>
                <th>Role</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {acls.map(acl => (
                <tr key={acl.id}>
                  <td>{acl.document_title || `#${acl.document}`}</td>
                  <td>{acl.subject_type}</td>
                  <td>{acl.subject_name || acl.subject_id}</td>
                  <td><span className={`role-badge role-${acl.role.toLowerCase()}`}>{acl.role}</span></td>
                  <td>{acl.expires_at ? new Date(acl.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td>{new Date(acl.created_at).toLocaleDateString()}</td>
                  <td className="action-cell">
                    <button className="action-btn" onClick={() => { setEditingACL(acl); setEditRole(acl.role); }}>Edit</button>
                    <button className="action-btn delete" onClick={() => handleDelete(acl.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {acls.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No ACL entries found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingACL && (
        <div className="modal-overlay" onClick={() => setEditingACL(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Edit ACL</h3>
            <div className="modal-field">
              <label>Role</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)}>
                <option value="VIEWER">VIEWER</option>
                <option value="EDITOR">EDITOR</option>
                <option value="OWNER">OWNER</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setEditingACL(null)}>Cancel</button>
              <button className="action-btn approve" onClick={handleUpdateRole}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
