import React, { useEffect, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listGroups, createGroup, deleteGroup,
  getGroupMembers, addGroupMembers, removeGroupMember, listUsers
} from '../services/documentService';
import type { Group, User, GroupMember } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './GroupsPage.css';

interface CreateForm {
  name: string;
}

interface AddMemberForm {
  userIds: number[];
}

const GroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: '' });
  const [addMemberForm, setAddMemberForm] = useState<AddMemberForm>({ userIds: [] });

  const loadGroups = async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      const [g, u] = await Promise.all([
        listGroups(),
        listUsers()
      ]);
      setGroups(g);
      setUsers(u);
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
    loadGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadGroupMembers(selectedGroup.id);
    }
  }, [selectedGroup]);

  const handleCreateGroup = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      await createGroup(createForm.name);
      showSnackbar(`Group "${createForm.name}" created successfully!`, 'success');
      setCreateForm({ name: '' });
      setShowCreateForm(false);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to create group', 'error');
    }
  };

  const handleDeleteGroup = async (groupId: number): Promise<void> => {
    if (!window.confirm('Delete this group? This will remove all group memberships.')) return;
    try {
      await deleteGroup(groupId);
      showSnackbar('Group deleted successfully!', 'success');
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(null);
      }
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to delete group', 'error');
    }
  };

  const handleAddMembers = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!selectedGroup || addMemberForm.userIds.length === 0) return;

    try {
      await addGroupMembers(selectedGroup.id, addMemberForm.userIds);
      showSnackbar('Members added successfully!', 'success');
      setAddMemberForm({ userIds: [] });
      await loadGroupMembers(selectedGroup.id);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to add members', 'error');
    }
  };

  const handleRemoveMember = async (userId: number): Promise<void> => {
    if (!window.confirm('Remove this user from the group?')) return;
    try {
      await removeGroupMember(selectedGroup!.id, userId);
      showSnackbar('Member removed successfully!', 'success');
      await loadGroupMembers(selectedGroup!.id);
      await loadGroups();
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to remove member', 'error');
    }
  };

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
    setAddMemberForm({ userIds: selected });
  };

  if (loading) {
    return (
      <div className="groups-page">
        <header className="groups-page-header">
          <h2>Groups Management</h2>
        </header>
        <div className="groups-loading">
          <div className="groups-loading-spinner"></div>
          <p>Loading groups and users...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="groups-page">
        <header className="groups-page-header">
          <h2>Groups Management</h2>
        </header>
        <div className="groups-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="groups-page">
      <header className="groups-page-header">
        <h2>Groups Management</h2>
        <div className="groups-header-actions">
          <button
            className="groups-header-btn groups-header-btn-primary"
            onClick={() => setShowCreateForm(true)}
          >
            Create Group
          </button>
          <button
            className="groups-header-btn groups-header-btn-secondary"
            onClick={() => navigate('/documents')}
          >
            Back to Documents
          </button>
        </div>
      </header>

      <div className="groups-layout">
        {/* Groups List */}
        <div className="groups-list-panel">
          <div className="groups-list-header">
            <h3>Groups</h3>
          </div>
          <div className="groups-list-body">
            {groups.length === 0 ? (
              <div className="groups-empty">
                <p>No groups available. Create one to get started.</p>
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
                      handleDeleteGroup(group.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Group Detail */}
        <div className="groups-detail-panel">
          {selectedGroup ? (
            <>
              <div className="groups-detail-header">
                <h3>Group: {selectedGroup.name}</h3>
              </div>

              <div className="groups-members-section">
                <h4 className="groups-members-title">Members ({groupMembers.length})</h4>
                {groupMembers.length === 0 ? (
                  <div className="groups-members-empty">No members in this group yet.</div>
                ) : (
                  groupMembers.map(member => (
                    <div key={member.user_id} className="groups-member-row">
                      <div>
                        <div className="groups-member-name">{member.user_display_name}</div>
                        <div className="groups-member-email">{member.user_email}</div>
                      </div>
                      <button
                        className="groups-member-remove"
                        onClick={() => handleRemoveMember(member.user_id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="groups-add-section">
                <h4 className="groups-add-title">Add Members</h4>
                <form onSubmit={handleAddMembers}>
                  <select
                    className="groups-add-select"
                    multiple
                    value={addMemberForm.userIds.map(String)}
                    onChange={handleSelectChange}
                  >
                    {users
                      .filter(user => !groupMembers.some(member => member.user_id === user.id))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.username} ({user.email})
                        </option>
                      ))
                    }
                  </select>
                  <p className="groups-add-hint">
                    Hold Ctrl/Cmd to select multiple users
                  </p>
                  <button
                    type="submit"
                    className="groups-add-btn"
                    disabled={addMemberForm.userIds.length === 0}
                  >
                    Add Selected Members
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="groups-detail-placeholder">
              <p>Select a group to view and manage its members</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateForm && (
        <div className="groups-modal-overlay">
          <div className="groups-modal">
            <h3>Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="groups-modal-input-group">
                <label>Group Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ name: e.target.value })}
                  required
                  placeholder="Enter group name"
                />
              </div>
              <div className="groups-modal-actions">
                <button
                  type="button"
                  className="groups-modal-cancel"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateForm({ name: '' });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="groups-modal-submit">
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
