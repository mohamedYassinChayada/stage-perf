import React, { useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile, changePassword, uploadAvatar } from '../services/documentService';
import type { UserProfile } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getUserProfile();
      setProfile(data);
      setEmail(data.email || '');
    } catch {
      showSnackbar('Failed to load profile', 'error');
    }
  };

  const onSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const updated = await updateUserProfile(email);
      setProfile(updated);
      showSnackbar('Profile updated successfully', 'success');
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const onUploadAvatar = async () => {
    if (!avatarFile) return;
    try {
      setUploadingAvatar(true);
      const result = await uploadAvatar(avatarFile);
      setProfile(prev => prev ? { ...prev, avatar_url: result.avatar_url } : prev);
      setAvatarFile(null);
      showSnackbar('Avatar uploaded successfully', 'success');
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to upload avatar', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      showSnackbar('Please fill in all password fields', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showSnackbar('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 4) {
      showSnackbar('New password must be at least 4 characters', 'error');
      return;
    }
    try {
      setChangingPassword(true);
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSnackbar('Password changed successfully', 'success');
    } catch (e) {
      showSnackbar((e as Error).message || 'Failed to change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const initial = profile?.username ? profile.username.charAt(0).toUpperCase() : '?';

  return (
    <div className="settings-page">
      <h2>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Settings
      </h2>

      {/* Profile Section */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Profile</h3>
        </div>
        <div className="settings-card-body">
          <div className="settings-field">
            <label>Username</label>
            <input type="text" value={profile?.username || ''} disabled />
          </div>
          <div className="settings-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
          </div>
          <div className="settings-actions">
            <button className="settings-btn settings-btn--primary" onClick={onSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* Avatar Section */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Avatar</h3>
        </div>
        <div className="settings-card-body">
          <div className="settings-avatar-section">
            <div className="settings-avatar-preview">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" />
              ) : (
                initial
              )}
            </div>
            <div className="settings-avatar-controls">
              <p>Upload a new avatar image (JPEG, PNG, GIF, WebP, max 2MB)</p>
              <div className="settings-file-input">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={e => setAvatarFile(e.target.files?.[0] || null)}
                />
                <button
                  className="settings-btn settings-btn--primary"
                  onClick={onUploadAvatar}
                  disabled={!avatarFile || uploadingAvatar}
                >
                  {uploadingAvatar ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Section */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Change Password</h3>
        </div>
        <div className="settings-card-body">
          <div className="settings-field">
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="settings-field">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="settings-field">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <div className="settings-actions">
            <button className="settings-btn settings-btn--primary" onClick={onChangePassword} disabled={changingPassword}>
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
