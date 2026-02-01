import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  getGroupsWithDocuments,
  getGroupDocuments,
  getDocumentACLs,
  createDocumentACL,
  updateDocumentACL,
  deleteDocumentACL,
  listGroups,
  listUsers,
  formatDate,
} from '../services/documentService';
import type {
  GroupWithDocuments,
  GroupDocument,
  ACLEntry,
  Group,
  User,
} from '../services/documentService';
import { Link } from 'react-router-dom';
import { showSnackbar } from '../components/Snackbar';
import { usePageCache } from '../contexts/PageCacheContext';
import { userGroupsEventService } from '../services/eventService';
import './GroupDocumentsPage.css';

// SVG Icons
const FolderIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const DocumentIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const UsersIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ShieldIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CrownIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
    <path d="M5 19h14v2H5z" />
  </svg>
);

const ChevronIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const GroupDocumentsPage: React.FC = () => {
  const { getGroupDocumentsCache, setGroupDocumentsCache } = usePageCache();

  // State for groups
  const [groupsWithDocs, setGroupsWithDocs] = useState<GroupWithDocuments[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithDocuments | null>(null);
  const [documents, setDocuments] = useState<GroupDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapsible sections
  const [ownedCollapsed, setOwnedCollapsed] = useState(false);
  const [memberCollapsed, setMemberCollapsed] = useState(false);

  // Documents cache per group
  const [documentsCache, setDocumentsCacheLocal] = useState<Record<number, GroupDocument[]>>({});

  // State for ACL management modal
  const [showACLModal, setShowACLModal] = useState(false);
  const [aclDocument, setACLDocument] = useState<GroupDocument | null>(null);
  const [acls, setACLs] = useState<ACLEntry[]>([]);
  const [loadingACLs, setLoadingACLs] = useState(false);

  // State for adding new ACL
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [newACLType, setNewACLType] = useState<'user' | 'group'>('user');
  const [newACLSubjectId, setNewACLSubjectId] = useState<string>('');
  const [newACLRole, setNewACLRole] = useState<'VIEWER' | 'EDITOR' | 'OWNER'>('VIEWER');
  const [newACLExpires, setNewACLExpires] = useState<string>('');
  const [addingACL, setAddingACL] = useState(false);

  // Segment groups into owned and member
  const ownedGroups = useMemo(
    () => groupsWithDocs.filter((g) => g.is_owner),
    [groupsWithDocs]
  );
  const memberGroups = useMemo(
    () => groupsWithDocs.filter((g) => !g.is_owner),
    [groupsWithDocs]
  );

  // Sync to page cache
  const syncCache = useCallback((groups: GroupWithDocuments[], selId: number | null, docCache: Record<number, GroupDocument[]>) => {
    setGroupDocumentsCache({
      groupsWithDocs: groups,
      selectedGroupId: selId,
      documents: docCache,
      timestamp: Date.now(),
    });
  }, [setGroupDocumentsCache]);

  // Load groups with document counts
  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const groups = await getGroupsWithDocuments();
      setGroupsWithDocs(groups);

      // Auto-select first group if any
      if (groups.length > 0 && !selectedGroup) {
        setSelectedGroup(groups[0]);
      }

      syncCache(groups, selectedGroup?.id ?? groups[0]?.id ?? null, documentsCache);
    } catch (err) {
      setError((err as Error).message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, documentsCache, syncCache]);

  // Load documents for selected group
  const loadDocuments = useCallback(async (groupId: number) => {
    // Check local documents cache first
    if (documentsCache[groupId]) {
      setDocuments(documentsCache[groupId]);
      return;
    }

    try {
      setLoadingDocuments(true);
      const docs = await getGroupDocuments(groupId);
      setDocuments(docs);
      setDocumentsCacheLocal((prev) => {
        const updated = { ...prev, [groupId]: docs };
        syncCache(groupsWithDocs, groupId, updated);
        return updated;
      });
    } catch (err) {
      showSnackbar('Failed to load documents', 'error');
      setDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  }, [documentsCache, groupsWithDocs, syncCache]);

  // Load ACLs for a document
  const loadACLs = async (documentId: number) => {
    try {
      setLoadingACLs(true);
      const aclList = await getDocumentACLs(documentId);
      setACLs(aclList);
    } catch (err) {
      showSnackbar('Failed to load access list', 'error');
      setACLs([]);
    } finally {
      setLoadingACLs(false);
    }
  };

  // Load all users and groups for ACL form
  const loadUsersAndGroups = async () => {
    try {
      const [users, groups] = await Promise.all([listUsers(), listGroups()]);
      setAllUsers(users);
      setAllGroups(groups);
    } catch (err) {
      console.error('Failed to load users/groups:', err);
    }
  };

  useEffect(() => {
    const cached = getGroupDocumentsCache();
    if (cached) {
      setGroupsWithDocs(cached.groupsWithDocs);
      setDocumentsCacheLocal(cached.documents);
      if (cached.selectedGroupId) {
        const g = cached.groupsWithDocs.find((gr) => gr.id === cached.selectedGroupId) || null;
        setSelectedGroup(g);
        if (g && cached.documents[g.id]) {
          setDocuments(cached.documents[g.id]);
        }
      }
      setLoading(false);
    } else {
      loadGroups();
    }
    loadUsersAndGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadDocuments(selectedGroup.id);
    }
  }, [selectedGroup, loadDocuments]);

  // Force refresh groups and documents (bypass cache)
  const forceRefreshAll = useCallback(async () => {
    try {
      // Clear local documents cache
      setDocumentsCacheLocal({});
      
      // Reload groups
      const groups = await getGroupsWithDocuments();
      setGroupsWithDocs(groups);

      // Reload documents for selected group if any
      if (selectedGroup) {
        const docs = await getGroupDocuments(selectedGroup.id);
        setDocuments(docs);
        setDocumentsCacheLocal({ [selectedGroup.id]: docs });
        syncCache(groups, selectedGroup.id, { [selectedGroup.id]: docs });
      } else if (groups.length > 0) {
        // Auto-select first group
        setSelectedGroup(groups[0]);
        const docs = await getGroupDocuments(groups[0].id);
        setDocuments(docs);
        setDocumentsCacheLocal({ [groups[0].id]: docs });
        syncCache(groups, groups[0].id, { [groups[0].id]: docs });
      } else {
        syncCache(groups, null, {});
      }
    } catch (err) {
      console.error('Failed to refresh group documents:', err);
    }
  }, [selectedGroup, syncCache]);

  // Subscribe to user groups event polling for real-time updates
  useEffect(() => {
    // Start polling when component mounts
    userGroupsEventService.start();

    // Subscribe to change notifications
    const unsubscribe = userGroupsEventService.subscribe(() => {
      // When changes are detected, force refresh the data
      forceRefreshAll();
      showSnackbar('New documents available', 'info');
    });

    return () => {
      // Cleanup: unsubscribe and stop polling when component unmounts
      unsubscribe();
      userGroupsEventService.stop();
    };
  }, [forceRefreshAll]);

  // Open ACL modal for a document
  const openACLModal = (doc: GroupDocument) => {
    setACLDocument(doc);
    setShowACLModal(true);
    loadACLs(doc.id);
    // Reset form
    setNewACLType('user');
    setNewACLSubjectId('');
    setNewACLRole('VIEWER');
    setNewACLExpires('');
  };

  // Close ACL modal
  const closeACLModal = () => {
    setShowACLModal(false);
    setACLDocument(null);
    setACLs([]);
  };

  // Add new ACL entry
  const handleAddACL = async () => {
    if (!aclDocument || !newACLSubjectId) {
      showSnackbar('Please select a user or group', 'error');
      return;
    }

    try {
      setAddingACL(true);
      await createDocumentACL(
        aclDocument.id,
        newACLType,
        newACLSubjectId,
        newACLRole,
        newACLExpires || null
      );
      showSnackbar('Access granted successfully', 'success');
      loadACLs(aclDocument.id);
      // Reset form
      setNewACLSubjectId('');
      setNewACLRole('VIEWER');
      setNewACLExpires('');
    } catch (err) {
      showSnackbar((err as Error).message || 'Failed to add access', 'error');
    } finally {
      setAddingACL(false);
    }
  };

  // Update ACL role
  const handleUpdateACLRole = async (acl: ACLEntry, newRole: 'VIEWER' | 'EDITOR' | 'OWNER') => {
    if (!aclDocument) return;

    try {
      await updateDocumentACL(aclDocument.id, acl.id, newRole);
      showSnackbar('Access updated', 'success');
      loadACLs(aclDocument.id);
    } catch (err) {
      showSnackbar('Failed to update access', 'error');
    }
  };

  // Delete ACL entry
  const handleDeleteACL = async (acl: ACLEntry) => {
    if (!aclDocument) return;

    try {
      await deleteDocumentACL(aclDocument.id, acl.id);
      showSnackbar('Access revoked', 'success');
      loadACLs(aclDocument.id);
    } catch (err) {
      showSnackbar('Failed to revoke access', 'error');
    }
  };

  // Get role badge class
  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER': return 'role-badge role-owner';
      case 'EDITOR': return 'role-badge role-editor';
      case 'VIEWER': return 'role-badge role-viewer';
      default: return 'role-badge';
    }
  };

  // Render a group item in the sidebar
  const renderGroupItem = (group: GroupWithDocuments) => (
    <li
      key={group.id}
      className={`group-item ${selectedGroup?.id === group.id ? 'selected' : ''}`}
      onClick={() => setSelectedGroup(group)}
    >
      <div className="group-item-icon">
        <FolderIcon />
      </div>
      <div className="group-item-info">
        <span className="group-name">
          {group.is_owner && (
            <span className="owner-crown" title="You own this group">
              <CrownIcon />
            </span>
          )}
          {group.name}
        </span>
        <span className="group-stats">
          <span>{group.document_count} docs</span>
          <span>·</span>
          <span>{group.member_count} members</span>
        </span>
        {!group.is_owner && group.created_by_username && (
          <span className="group-owner-label">
            Owner: {group.created_by_username}
          </span>
        )}
      </div>
    </li>
  );

  if (loading) {
    return (
      <div className="group-docs-page">
        <div className="group-docs-loading">
          <div className="loading-spinner"></div>
          <p>Loading groups...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-docs-page">
        <div className="group-docs-error">
          <p>{error}</p>
          <button onClick={loadGroups}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group-docs-page">
      {/* Header */}
      <header className="group-docs-header">
        <h1>Group Documents</h1>
        <p>Browse documents shared with your groups and manage access permissions</p>
      </header>

      <div className="group-docs-container">
        {/* Groups Sidebar */}
        <aside className="groups-sidebar">
          <h2>Your Groups</h2>
          {groupsWithDocs.length === 0 ? (
            <div className="no-groups">
              <p>You're not a member of any groups yet.</p>
              <Link to="/groups" className="link-btn">Manage Groups</Link>
            </div>
          ) : (
            <>
              {/* Groups I Own */}
              {ownedGroups.length > 0 && (
                <div className="groups-section">
                  <button
                    className="section-header"
                    onClick={() => setOwnedCollapsed(!ownedCollapsed)}
                  >
                    <ChevronIcon collapsed={ownedCollapsed} />
                    <span className="section-title">Groups I Own</span>
                    <span className="section-count">{ownedGroups.length}</span>
                  </button>
                  {!ownedCollapsed && (
                    <ul className="groups-list">
                      {ownedGroups.map(renderGroupItem)}
                    </ul>
                  )}
                </div>
              )}

              {/* Groups I'm In */}
              {memberGroups.length > 0 && (
                <div className="groups-section">
                  <button
                    className="section-header"
                    onClick={() => setMemberCollapsed(!memberCollapsed)}
                  >
                    <ChevronIcon collapsed={memberCollapsed} />
                    <span className="section-title">Groups I'm In</span>
                    <span className="section-count">{memberGroups.length}</span>
                  </button>
                  {!memberCollapsed && (
                    <ul className="groups-list">
                      {memberGroups.map(renderGroupItem)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </aside>

        {/* Documents Panel */}
        <main className="documents-panel">
          {selectedGroup ? (
            <>
              <div className="panel-header">
                <h2>
                  <FolderIcon /> {selectedGroup.name}
                  {selectedGroup.is_owner && (
                    <span className="owner-badge">Owner</span>
                  )}
                </h2>
                <span className="doc-count">{documents.length} document(s)</span>
              </div>

              {loadingDocuments ? (
                <div className="loading-docs">
                  <div className="loading-spinner"></div>
                  <p>Loading documents...</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="no-documents">
                  <DocumentIcon />
                  <p>No documents shared with this group yet.</p>
                </div>
              ) : (
                <div className="documents-grid">
                  {documents.map((doc) => (
                    <div key={doc.id} className="document-card">
                      <div className="doc-card-header">
                        <DocumentIcon />
                        <Link to={`/documents/${doc.id}`} className="doc-title">
                          {doc.title}
                        </Link>
                      </div>
                      <div className="doc-card-meta">
                        <span className="doc-owner">By: {doc.owner_username || 'Unknown'}</span>
                        <span className="doc-date">{formatDate(doc.updated_at)}</span>
                      </div>
                      <div className="doc-card-footer">
                        <span className={getRoleBadgeClass(doc.group_role || 'VIEWER')}>
                          {doc.group_role || 'VIEWER'}
                        </span>
                        {selectedGroup?.is_owner && (
                          <button
                            className="manage-access-btn"
                            onClick={() => openACLModal(doc)}
                            title="Manage Access"
                          >
                            <ShieldIcon /> Manage Access
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="no-selection">
              <UsersIcon />
              <p>Select a group to view its documents</p>
            </div>
          )}
        </main>
      </div>

      {/* ACL Management Modal */}
      {showACLModal && aclDocument && (
        <div className="acl-modal-overlay" onClick={closeACLModal}>
          <div className="acl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="acl-modal-header">
              <h3>
                <ShieldIcon /> Access Management
              </h3>
              <button className="close-btn" onClick={closeACLModal}>
                <CloseIcon />
              </button>
            </div>

            <div className="acl-modal-content">
              <p className="doc-name">
                <DocumentIcon /> {aclDocument.title}
              </p>

              {/* Current Access List */}
              <div className="acl-section">
                <h4>Current Access</h4>
                {loadingACLs ? (
                  <div className="loading-acls">Loading...</div>
                ) : acls.length === 0 ? (
                  <p className="no-acls">No access entries yet.</p>
                ) : (
                  <ul className="acl-list">
                    {acls.map((acl) => (
                      <li key={acl.id} className="acl-item">
                        <div className="acl-subject">
                          <span className={`subject-type ${acl.subject_type}`}>
                            {acl.subject_type === 'user' ? '👤' : '👥'}
                          </span>
                          <span className="subject-name">
                            {acl.subject_name || `${acl.subject_type} #${acl.subject_id}`}
                          </span>
                        </div>
                        <div className="acl-controls">
                          <select
                            value={acl.role}
                            onChange={(e) => handleUpdateACLRole(acl, e.target.value as 'VIEWER' | 'EDITOR' | 'OWNER')}
                          >
                            <option value="VIEWER">Viewer</option>
                            <option value="EDITOR">Editor</option>
                            <option value="OWNER">Owner</option>
                          </select>
                          <button
                            className="delete-acl-btn"
                            onClick={() => handleDeleteACL(acl)}
                            title="Revoke Access"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        {acl.expires_at && (
                          <span className="acl-expires">
                            Expires: {formatDate(acl.expires_at)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add New Access */}
              <div className="acl-section">
                <h4>Grant Access</h4>
                <div className="add-acl-form">
                  <div className="form-row">
                    <select
                      value={newACLType}
                      onChange={(e) => {
                        setNewACLType(e.target.value as 'user' | 'group');
                        setNewACLSubjectId('');
                      }}
                    >
                      <option value="user">User</option>
                      <option value="group">Group</option>
                    </select>

                    <select
                      value={newACLSubjectId}
                      onChange={(e) => setNewACLSubjectId(e.target.value)}
                    >
                      <option value="">Select {newACLType}...</option>
                      {newACLType === 'user'
                        ? allUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.email || u.username}
                            </option>
                          ))
                        : allGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                    </select>

                    <select
                      value={newACLRole}
                      onChange={(e) => setNewACLRole(e.target.value as 'VIEWER' | 'EDITOR' | 'OWNER')}
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                      <option value="OWNER">Owner</option>
                    </select>
                  </div>

                  <div className="form-row">
                    <label>
                      Expires (optional):
                      <input
                        type="datetime-local"
                        value={newACLExpires}
                        onChange={(e) => setNewACLExpires(e.target.value)}
                      />
                    </label>
                    <button
                      className="add-acl-btn"
                      onClick={handleAddACL}
                      disabled={addingACL || !newACLSubjectId}
                    >
                      {addingACL ? 'Adding...' : 'Grant Access'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDocumentsPage;
