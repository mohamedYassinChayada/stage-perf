import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/documentService';
import type { NotificationItem } from '../services/documentService';
import { showSnackbar } from '../components/Snackbar';
import './NotificationsPage.css';

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  document_edited: 'Document Edited',
  document_deleted: 'Document Deleted',
  acl_granted: 'Access Granted',
  acl_revoked: 'Access Revoked',
  acl_changed: 'Access Changed',
  account_approved: 'Account Approved',
  account_rejected: 'Account Rejected',
  new_registration: 'New Registration',
  email_verified: 'Email Verified',
};

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const data = await getNotifications(filter === 'unread', page);
      setNotifications(data.results);
      setTotalCount(data.count);
    } catch {
      showSnackbar('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter, page]);

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      } catch {
        // ignore
      }
    }
    if (notif.document_info?.id) {
      navigate(`/documents/${notif.document_info.id}`);
    } else if (notif.notification_type === 'new_registration' || notif.notification_type === 'email_verified') {
      navigate('/admin');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      showSnackbar('All notifications marked as read', 'success');
    } catch {
      showSnackbar('Failed to mark all as read', 'error');
    }
  };

  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <div className="notifications-actions">
          <div className="notifications-filter">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => { setFilter('all'); setPage(1); }}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => { setFilter('unread'); setPage(1); }}
            >
              Unread
            </button>
          </div>
          <button className="mark-all-read-btn" onClick={handleMarkAllRead}>
            Mark all as read
          </button>
        </div>
      </div>

      {loading ? (
        <div className="notifications-loading">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="notifications-empty">
          {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
        </div>
      ) : (
        <div className="notifications-list">
          {notifications.map(notif => (
            <button
              key={notif.id}
              className={`notification-row ${!notif.read ? 'unread' : ''}`}
              onClick={() => handleClick(notif)}
            >
              <div className="notification-row-left">
                <span className={`notification-dot ${!notif.read ? 'visible' : ''}`} />
                <div>
                  <div className="notification-row-title">{notif.title}</div>
                  <div className="notification-row-message">{notif.message}</div>
                  <div className="notification-row-meta">
                    <span className="notification-type-label">
                      {NOTIFICATION_TYPE_LABELS[notif.notification_type] || notif.notification_type}
                    </span>
                    <span className="notification-row-time">
                      {new Date(notif.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="notifications-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
