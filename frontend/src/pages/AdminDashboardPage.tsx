import React, { useState, useEffect, useCallback } from 'react';
import {
  adminGetUsers, adminApproveUser, adminRejectUser, adminDeleteUser,
  adminResendVerification, adminGetACLs, adminUpdateACL, adminDeleteACL,
  adminGetDashboardStats, adminGetGroups,
} from '../services/documentService';
import type { AdminUser, AdminACL, DashboardStats, AdminGroup, PaginatedACLResponse } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './AdminDashboardPage.css';

type Tab = 'dashboard' | 'users' | 'acl' | 'groups';
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
          <button className={`admin-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>Groups</button>
        </div>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'acl' && <ACLTab />}
      {tab === 'groups' && <GroupsTab />}
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
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredUsers = searchQuery.trim()
    ? users.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

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

      <div className="admin-filter-bar">
        <input
          type="text"
          placeholder="Search by username or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="admin-search-input"
        />
        <span className="admin-result-count">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="admin-loading">Loading users...</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
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
              {filteredUsers.map((u, idx) => (
                <tr key={u.id}>
                  <td className="index-cell">{idx + 1}</td>
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
              {filteredUsers.length === 0 && (
                <tr><td colSpan={8} className="empty-cell">No users found</td></tr>
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
  const [aclData, setAclData] = useState<PaginatedACLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingACL, setEditingACL] = useState<AdminACL | null>(null);
  const [editRole, setEditRole] = useState('');

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchACLs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const filters: Record<string, string | number> = { page, page_size: pageSize };
      if (roleFilter) filters.role = roleFilter;
      if (typeFilter) filters.subject_type = typeFilter;
      if (searchFilter.trim()) filters.search = searchFilter.trim();
      const data = await adminGetACLs(filters as Parameters<typeof adminGetACLs>[0]);
      setAclData(data);
      setCurrentPage(page);
    } catch {
      showSnackbar('Failed to load ACLs', 'error');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, typeFilter, searchFilter]);

  useEffect(() => { fetchACLs(1); }, [roleFilter, typeFilter]);

  const handleSearch = () => { fetchACLs(1); };

  const handleUpdateRole = async () => {
    if (!editingACL) return;
    try {
      await adminUpdateACL(editingACL.id, { role: editRole });
      showSnackbar('ACL updated', 'success');
      setEditingACL(null);
      fetchACLs(currentPage);
    } catch { showSnackbar('Failed to update ACL', 'error'); }
  };

  const handleDelete = async (aclId: string) => {
    if (!confirm('Delete this ACL entry?')) return;
    try {
      await adminDeleteACL(aclId);
      showSnackbar('ACL deleted', 'success');
      fetchACLs(currentPage);
    } catch { showSnackbar('Failed to delete ACL', 'error'); }
  };

  const goToPage = (page: number) => {
    if (page < 1 || (aclData && page > aclData.total_pages)) return;
    fetchACLs(page);
  };

  const acls = aclData?.results || [];
  const totalPages = aclData?.total_pages || 1;
  const totalCount = aclData?.count || 0;

  return (
    <div className="acl-content">
      <div className="acl-filters">
        <div className="acl-filter-group">
          <label>Role</label>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="OWNER">OWNER</option>
            <option value="EDITOR">EDITOR</option>
            <option value="VIEWER">VIEWER</option>
          </select>
        </div>
        <div className="acl-filter-group">
          <label>Type</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="user">User</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div className="acl-filter-group acl-filter-search">
          <label>Search</label>
          <div className="acl-search-row">
            <input
              type="text"
              placeholder="Search by name or document..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button className="action-btn" onClick={handleSearch}>Search</button>
          </div>
        </div>
        <div className="acl-filter-count">
          {totalCount} ACL{totalCount !== 1 ? 's' : ''} found
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Loading ACLs...</div>
      ) : (
        <>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
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
                {acls.map((acl, idx) => (
                  <tr key={acl.id}>
                    <td className="index-cell">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td>{acl.document_title || `#${acl.document}`}</td>
                    <td><span className={`type-badge type-${acl.subject_type}`}>{acl.subject_type}</span></td>
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
                  <tr><td colSpan={8} className="empty-cell">No ACL entries found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="admin-pagination">
              <button className="admin-page-btn" disabled={currentPage === 1} onClick={() => goToPage(1)}>&laquo;</button>
              <button className="admin-page-btn" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>&lsaquo;</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                return (
                  <button
                    key={page}
                    className={`admin-page-btn ${page === currentPage ? 'active' : ''}`}
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </button>
                );
              })}
              <button className="admin-page-btn" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>&rsaquo;</button>
              <button className="admin-page-btn" disabled={currentPage === totalPages} onClick={() => goToPage(totalPages)}>&raquo;</button>
              <span className="admin-page-info">Page {currentPage} of {totalPages}</span>
            </div>
          )}
        </>
      )}

      {editingACL && (
        <div className="modal-overlay" onClick={() => setEditingACL(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Edit ACL</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              {editingACL.subject_name || editingACL.subject_id} on "{editingACL.document_title || `Document #${editingACL.document}`}"
            </p>
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

const GroupsTab: React.FC = () => {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGetGroups();
        setGroups(data);
      } catch {
        showSnackbar('Failed to load groups', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredGroups = searchQuery.trim()
    ? groups.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.owner_username || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groups;

  if (loading) return <div className="admin-loading">Loading groups...</div>;

  return (
    <div className="groups-admin-content">
      <div className="admin-filter-bar">
        <input
          type="text"
          placeholder="Search by group name or owner..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="admin-search-input"
        />
        <span className="admin-result-count">{filteredGroups.length} group{filteredGroups.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ID</th>
              <th>Group Name</th>
              <th>Owner</th>
              <th>Members</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((g, idx) => (
              <tr key={g.id}>
                <td className="index-cell">{idx + 1}</td>
                <td>{g.id}</td>
                <td style={{ fontWeight: 500 }}>{g.name}</td>
                <td>
                  {g.owner_username
                    ? <span>{g.owner_username}</span>
                    : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown</span>
                  }
                </td>
                <td>{g.member_count}</td>
              </tr>
            ))}
            {filteredGroups.length === 0 && (
              <tr><td colSpan={5} className="empty-cell">No groups found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
