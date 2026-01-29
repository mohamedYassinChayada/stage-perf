import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  listGroups, createGroup, deleteGroup,
  getGroupMembers, addGroupMembers, removeGroupMember, listUsers
} from '../services/documentService';
import type { Group, User, GroupMember } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import { usePageCache } from '../contexts/PageCacheContext';
import './GroupsPage.css';

const TrashIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const UserIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const GroupsPage: React.FC = () => {
  const { getGroupsCache, setGroupsCache } = usePageCache();

  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<Group | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<GroupMember | null>(null);

  const loadGroups = async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      const [g, u] = await Promise.all([listGroups(), listUsers()]);
      setGroups(g);
      setUsers(u);
      setGroupsCache({
        groups: g,
        users: u,
        selectedGroupId: selectedGroup?.id ?? null,
        groupMembers,
        timestamp: Date.now(),
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupMembers = async (groupId: number): Promise<void> => {
    try {
      const members = await getGroupMembers(groupId);
      setGroupMembers(members);
    } catch (e) {
      console.error('Failed to load group members:', e);
      setGroupMembers([]);
    }
  };

  useEffect(() => {
    const cached = getGroupsCache();
    if (cached) {
      setGroups(cached.groups);
      setUsers(cached.users);
      setGroupMembers(cached.groupMembers);
      if (cached.selectedGroupId) {
        const g = cached.groups.find(gr => gr.id === cached.selectedGroupId) || null;
        setSelectedGroup(g);
      }
      setLoading(false);
    } else {
      loadGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadGroupMembers(selectedGroup.id);
      setSelectedUserIds([]);
    }
  }, [selectedGroup]);

  // Sync cache when groups/members change
  useEffect(() => {
    if (groups.length > 0 || users.length > 0) {
      setGroupsCache({
        groups,
        users,
        selectedGroupId: selectedGroup?.id ?? null,
        groupMembers,
        timestamp: Date.now(),
      });
    }
  }, [groups, users, selectedGroup, groupMembers, setGroupsCache]);

  const handleCreateGroup = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!createName.trim()) return;
    try {
      await createGroup(createName.trim());
      showSnackbar(`Group "${createName.trim()}" created`, 'success');
      setCreateName('');
      setShowCreateForm(false);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to create group', 'error');
    }
  };

  const handleDeleteGroup = async (): Promise<void> => {
    if (!deleteConfirm) return;
    try {
      await deleteGroup(deleteConfirm.id);
      showSnackbar(`Group "${deleteConfirm.name}" deleted`, 'success');
      if (selectedGroup && selectedGroup.id === deleteConfirm.id) {
        setSelectedGroup(null);
        setGroupMembers([]);
      }
      setDeleteConfirm(null);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to delete group', 'error');
    }
  };

  const handleAddMembers = async (): Promise<void> => {
    if (!selectedGroup || selectedUserIds.length === 0) return;
    try {
      await addGroupMembers(selectedGroup.id, selectedUserIds);
      showSnackbar(`${selectedUserIds.length} member${selectedUserIds.length > 1 ? 's' : ''} added`, 'success');
      setSelectedUserIds([]);
      await loadGroupMembers(selectedGroup.id);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to add members', 'error');
    }
  };

  const handleRemoveMember = async (): Promise<void> => {
    if (!removeConfirm || !selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup.id, removeConfirm.user_id);
      showSnackbar(`${removeConfirm.user_display_name} removed`, 'success');
      setRemoveConfirm(null);
      await loadGroupMembers(selectedGroup.id);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to remove member', 'error');
    }
  };

  const toggleUserSelection = (userId: number): void => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const availableUsers = users.filter(
    user => !groupMembers.some(member => member.user_id === user.id)
  );

  if (loading) {
    return (
      <div className="groups-page">
        <div className="groups-loading">
          <div className="groups-loading-spinner" />
          <p>Loading groups...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="groups-page">
        <div className="groups-error">
          <p>{error}</p>
          <button className="groups-retry-btn" onClick={loadGroups}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="groups-page">
      <div className="groups-layout">
        {/* Groups List Panel */}
        <div className="groups-list-panel">
          <div className="groups-list-header">
            <h3>Groups</h3>
            <button
              className="groups-create-btn"
              onClick={() => setShowCreateForm(true)}
              title="Create new group"
            >
              <PlusIcon />
            </button>
          </div>
          <div className="groups-list-body">
            {groups.length === 0 ? (
              <div className="groups-empty">
                <UserIcon />
                <p>No groups yet</p>
                <p className="groups-empty-hint">Create your first group to get started</p>
              </div>
            ) : (
              groups.map(group => (
                <div
                  key={group.id}
                  className={`groups-card ${selectedGroup?.id === group.id ? 'selected' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="groups-card-info">
                    <div className="groups-card-name">{group.name}</div>
                    <div className="groups-card-count">
                      {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    className="groups-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(group);
                    }}
                    title={`Delete "${group.name}"`}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Group Detail Panel */}
        <div className="groups-detail-panel">
          {selectedGroup ? (
            <>
              <div className="groups-detail-header">
                <h3>{selectedGroup.name}</h3>
                <span className="groups-detail-count">
                  {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="groups-detail-content">
                {/* Members List */}
                <div className="groups-members-section">
                  <h4 className="groups-section-title">Members</h4>
                  {groupMembers.length === 0 ? (
                    <div className="groups-members-empty">
                      <p>No members in this group yet</p>
                    </div>
                  ) : (
                    <div className="groups-members-list">
                      {groupMembers.map(member => (
                        <div key={member.user_id} className="groups-member-row">
                          <div className="groups-member-avatar">
                            {member.user_display_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="groups-member-info">
                            <div className="groups-member-name">{member.user_display_name}</div>
                            {member.user_email && (
                              <div className="groups-member-email">{member.user_email}</div>
                            )}
                          </div>
                          <button
                            className="groups-member-remove"
                            onClick={() => setRemoveConfirm(member)}
                            title={`Remove ${member.user_display_name}`}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Members */}
                {availableUsers.length > 0 && (
                  <div className="groups-add-section">
                    <h4 className="groups-section-title">Add Members</h4>
                    <div className="groups-add-user-list">
                      {availableUsers.map(user => (
                        <label
                          key={user.id}
                          className={`groups-add-user-item ${selectedUserIds.includes(user.id) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(user.id)}
                            onChange={() => toggleUserSelection(user.id)}
                          />
                          <div className="groups-add-user-avatar">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="groups-add-user-info">
                            <span className="groups-add-user-name">{user.username}</span>
                            {user.email && (
                              <span className="groups-add-user-email">{user.email}</span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    <button
                      className="groups-add-btn"
                      disabled={selectedUserIds.length === 0}
                      onClick={handleAddMembers}
                    >
                      Add {selectedUserIds.length > 0 ? `${selectedUserIds.length} ` : ''}Selected
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="groups-detail-placeholder">
              <UserIcon />
              <p>Select a group to manage members</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateForm && (
        <div className="groups-modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="groups-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="groups-modal-input-group">
                <label>Group Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  placeholder="Enter group name"
                  autoFocus
                />
              </div>
              <div className="groups-modal-actions">
                <button
                  type="button"
                  className="groups-modal-cancel"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateName('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="groups-modal-submit">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="groups-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="groups-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="groups-modal-danger-title">Delete "{deleteConfirm.name}"?</h3>
            <p className="groups-modal-message">
              This will remove all group memberships. This action cannot be undone.
            </p>
            <div className="groups-modal-actions">
              <button className="groups-modal-cancel" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="groups-modal-delete" onClick={handleDeleteGroup}>
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {removeConfirm && (
        <div className="groups-modal-overlay" onClick={() => setRemoveConfirm(null)}>
          <div className="groups-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="groups-modal-danger-title">Remove "{removeConfirm.user_display_name}"?</h3>
            <p className="groups-modal-message">
              This user will be removed from the group "{selectedGroup?.name}".
            </p>
            <div className="groups-modal-actions">
              <button className="groups-modal-cancel" onClick={() => setRemoveConfirm(null)}>
                Cancel
              </button>
              <button className="groups-modal-delete" onClick={handleRemoveMember}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
