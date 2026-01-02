import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  listGroups, createGroup, getGroup, updateGroup, deleteGroup,
  getGroupMembers, addGroupMembers, removeGroupMember, listUsers
} from '../services/documentService';

const GroupsPage = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '' });
  const [addMemberForm, setAddMemberForm] = useState({ userIds: [] });

  const loadGroups = async () => {
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
      setError(e.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupMembers = async (groupId) => {
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

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await createGroup(createForm.name);
      setCreateForm({ name: '' });
      setShowCreateForm(false);
      await loadGroups();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Delete this group? This will remove all group memberships.')) return;
    try {
      await deleteGroup(groupId);
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(null);
      }
      await loadGroups();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleAddMembers = async (e) => {
    e.preventDefault();
    if (!selectedGroup || addMemberForm.userIds.length === 0) return;
    
    try {
      await addGroupMembers(selectedGroup.id, addMemberForm.userIds);
      setAddMemberForm({ userIds: [] });
      await loadGroupMembers(selectedGroup.id);
      await loadGroups(); // Refresh member counts
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this user from the group?')) return;
    try {
      await removeGroupMember(selectedGroup.id, userId);
      await loadGroupMembers(selectedGroup.id);
      await loadGroups(); // Refresh member counts
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Groups Management</h2>
        <div>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowCreateForm(true)}
            style={{ marginRight: 8 }}
          >
            Create Group
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
            Back to Documents
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {/* Groups List */}
        <div style={{ flex: '1 1 300px' }}>
          <h3>Groups</h3>
          {groups.length === 0 ? (
            <div>No groups available.</div>
          ) : (
            <div>
              {groups.map(group => (
                <div 
                  key={group.id}
                  style={{
                    border: selectedGroup?.id === group.id ? '2px solid #007bff' : '1px solid #ddd',
                    borderRadius: 4,
                    padding: 12,
                    marginBottom: 8,
                    cursor: 'pointer',
                    backgroundColor: selectedGroup?.id === group.id ? '#f8f9fa' : 'white'
                  }}
                  onClick={() => setSelectedGroup(group)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{group.name}</strong>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>
                        {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(group.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Details */}
        <div style={{ flex: '1 1 400px' }}>
          {selectedGroup ? (
            <div>
              <h3>Group: {selectedGroup.name}</h3>
              
              <h4>Members ({groupMembers.length})</h4>
              {groupMembers.length === 0 ? (
                <div>No members in this group.</div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  {groupMembers.map(member => (
                    <div 
                      key={member.user_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 8,
                        border: '1px solid #eee',
                        borderRadius: 4,
                        marginBottom: 4
                      }}
                    >
                      <div>
                        <strong>{member.user_display_name}</strong>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>
                          {member.user_email}
                        </div>
                      </div>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleRemoveMember(member.user_id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h4>Add Members</h4>
              <form onSubmit={handleAddMembers}>
                <select 
                  multiple
                  value={addMemberForm.userIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                    setAddMemberForm({ userIds: selected });
                  }}
                  style={{ width: '100%', height: 120, marginBottom: 8 }}
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
                <div style={{ fontSize: '0.9em', color: '#666', marginBottom: 8 }}>
                  Hold Ctrl/Cmd to select multiple users
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={addMemberForm.userIds.length === 0}
                >
                  Add Selected Members
                </button>
              </form>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: '#666' }}>
              Select a group to view and manage its members
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: 24,
            borderRadius: 8,
            minWidth: 400,
            maxWidth: '90%'
          }}>
            <h3>Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Group Name:</label>
                <input 
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ name: e.target.value })}
                  required
                  style={{ width: '100%', padding: 8 }}
                  placeholder="Enter group name"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateForm({ name: '' });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
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
