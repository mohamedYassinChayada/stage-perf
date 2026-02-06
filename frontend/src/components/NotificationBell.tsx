import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount, getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/documentService';
import type { NotificationItem } from '../services/documentService';
import './NotificationBell.css';

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  document_edited: 'E',
  document_deleted: 'D',
  acl_granted: '+',
  acl_revoked: '-',
  acl_changed: '~',
  account_approved: 'A',
  account_rejected: 'R',
  new_registration: 'N',
  email_verified: 'V',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) fetchUnreadCount();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchUnreadCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = async () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setLoading(true);
      try {
        const data = await getNotifications(false, 1);
        setNotifications(data.results.slice(0, 10));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch {
        // ignore
      }
    }
    setIsOpen(false);
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
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button className="notification-bell-btn" onClick={openDropdown} title="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="notification-mark-all-btn" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-dropdown-list">
            {loading ? (
              <div className="notification-empty">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">No notifications</div>
            ) : (
              notifications.map(notif => (
                <button
                  key={notif.id}
                  className={`notification-item ${!notif.read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <span className="notification-type-icon">
                    {NOTIFICATION_TYPE_ICONS[notif.notification_type] || '?'}
                  </span>
                  <div className="notification-item-content">
                    <div className="notification-item-title">{notif.title}</div>
                    <div className="notification-item-time">{timeAgo(notif.created_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="notification-dropdown-footer">
            <button
              className="notification-view-all-btn"
              onClick={() => { setIsOpen(false); navigate('/notifications'); }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
