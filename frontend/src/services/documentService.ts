/**
 * Document management service for handling API calls to the Django backend
 */

// Use environment variable or default to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Type definitions
export interface Document {
  id: number;
  title: string;
  owner_username?: string;
  created_at: string;
  updated_at: string;
  file_url?: string;
  qr_code_url?: string;
  html?: string;
  html_content?: string;
  labels?: Label[];
  collections?: Collection[];
  attachments?: Attachment[];
  user_role?: string;
  user_permissions?: string[];
  current_version_no?: number;
}

export interface Label {
  id: string;
  name: string;
}

export interface Collection {
  id: number;
  name: string;
  parent_id?: number | null;
  document_count?: number;
  subcollection_count?: number;
}

export interface CollectionDetail extends Collection {
  document_count: number;
  subcollection_count: number;
}

export interface Attachment {
  url: string;
  filename: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface Group {
  id: number;
  name: string;
  member_count: number;
}

export interface GroupMember {
  user_id: number;
  user_display_name: string;
  user_email: string;
}

export interface Share {
  id: number;
  subject_type: 'user' | 'group';
  subject_id: string;
  role: 'VIEWER' | 'EDITOR' | 'OWNER';
  expires_at: string | null;
}

export interface ShareLink {
  id: string;
  token: string;
  role: 'VIEWER' | 'EDITOR' | 'OWNER';
  expires_at: string | null;
  is_revoked: boolean;
  is_expired: boolean;
}

export interface AuditLogEntry {
  id: number;
  ts: string;
  action: string;
  action_display?: string;
  actor_user?: number;
  actor_name?: string;
  actor_email?: string;
  version_no?: number;
  context?: Record<string, unknown>;
  ip?: string;
  share_link_token?: string;
  qr_link_code?: string;
}

export interface AuditLogResponse {
  results: AuditLogEntry[];
  count: number;
}

export interface Version {
  id: string;
  version_no: number;
  created_at: string;
  author_name?: string;
  author_email?: string;
  change_note?: string;
  content_preview?: string;
}

export interface VersionDetail extends Version {
  html?: string;
}

// Alias for backwards compatibility
export type DocumentVersion = VersionDetail;

export interface MeResponse {
  authenticated: boolean;
  id?: number;
  username?: string;
  email?: string;
  avatar_url?: string | null;
  is_admin?: boolean;
  email_verified?: boolean;
  approval_status?: string;
}

export interface NotificationItem {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  document?: number;
  document_info?: { id: number; title: string } | null;
  actor?: number;
  actor_info?: { id: number; username: string } | null;
  read: boolean;
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  date_joined: string;
  email_verified: boolean;
  approval_status: string;
  rejected_reason?: string | null;
  profile_created_at?: string | null;
}

export interface AdminACL {
  id: string;
  document: number;
  document_title?: string;
  subject_type: string;
  subject_id: string;
  subject_name?: string;
  role: string;
  expires_at?: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_users: number;
  users_by_status: Record<string, number>;
  total_documents: number;
  total_acls: number;
  recent_registrations: AdminUser[];
  recent_activity: AuditLogEntry[];
}

export interface AdminGroup {
  id: number;
  name: string;
  member_count: number;
  owner_username: string | null;
}

export interface PaginatedACLResponse {
  results: AdminACL[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
}

export interface ShareLinkAccess {
  document: Document;
  access_role: 'VIEWER' | 'EDITOR' | 'OWNER';
}

const getToken = (): string | null => localStorage.getItem('token');

const authHeaders = (): HeadersInit => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Token ${t}`;
  return h;
};

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Get all documents with their QR codes (handles pagination)
 */
export const getAllDocuments = async (): Promise<Document[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    // Handle both paginated and non-paginated responses
    if (Array.isArray(data)) {
      return data;
    }
    // Paginated response - return results array
    return data.results || [];
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
};

/**
 * Get documents with pagination info
 */
export const getDocumentsPaginated = async (page: number = 1, _pageSize: number = 10, owner?: string): Promise<PaginatedResponse<Document>> => {
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (owner) params.set('owner', owner);
    const response = await fetch(`${API_BASE_URL}/documents/?${params}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
};

/**
 * Get a specific document by ID
 */
export const getDocument = async (documentId: string | number): Promise<Document> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching document:', error);
    throw error;
  }
};

/**
 * Create a new document with automatic QR code generation
 */
export const createDocument = async (title: string, file: File): Promise<Document> => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);

    const t = getToken();
    const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
};

/**
 * Update an existing document
 */
export const updateDocument = async (documentId: number, title: string, file: File | null = null): Promise<Document> => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    if (file) {
      formData.append('file', file);
    }

    const t = getToken();
    const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
      method: 'PUT',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
};

/**
 * Delete a document
 */
export const deleteDocument = async (documentId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};

/**
 * Get QR code image URL for a document
 */
export const getQRCodeUrl = (documentId: number): string => {
  return `${API_BASE_URL}/documents/${documentId}/qrcode/`;
};

/**
 * Update HTML content only
 */
export const updateDocumentHtml = async (documentId: string | number, title: string, html: string): Promise<Document> => {
  const t = getToken();
  const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};

  const fd = new FormData();
  fd.append('title', title);
  fd.append('html', html);

  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
    method: 'PUT',
    headers,
    body: fd,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return await response.json();
};

// Auth helpers
export const register = async (username: string, password: string, email: string): Promise<{ token?: string }> => {
  const res = await fetch(`${API_BASE_URL}/auth/register/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, password, email })
  });
  if (!res.ok) throw new Error('Register failed');
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  return data;
};

export const me = async (): Promise<MeResponse> => {
  const res = await fetch(`${API_BASE_URL}/auth/me/`, { headers: authHeaders() });
  return res.json();
};

export const login = async (username: string, password: string): Promise<{ token?: string }> => {
  const res = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  return data;
};

export const logout = async (): Promise<boolean> => {
  const res = await fetch(`${API_BASE_URL}/auth/logout/`, { method: 'POST', headers: authHeaders() });
  localStorage.removeItem('token');
  return res.ok;
};

// ACL/Sharing
export const listShares = async (documentId: string | number): Promise<Share[]> => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/shares/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load shares');
  return res.json();
};

export const addShare = async (
  documentId: string | number,
  subjectType: 'user' | 'group',
  subjectId: string,
  role: string,
  expiresAt: string | null = null
): Promise<Share> => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/share/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, role, expires_at: expiresAt })
  });
  if (!res.ok) throw new Error('Failed to add share');
  return res.json();
};

export const listUsers = async (): Promise<User[]> => {
  const res = await fetch(`${API_BASE_URL}/auth/users/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
};

export const deleteShare = async (shareId: number): Promise<boolean> => {
  const res = await fetch(`${API_BASE_URL}/shares/${shareId}/`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to delete share');
  return true;
};

// Labels
export const listLabels = async (): Promise<Label[]> => {
  const res = await fetch(`${API_BASE_URL}/labels/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load labels');
  return res.json();
};

export const createLabel = async (name: string): Promise<Label> => {
  const res = await fetch(`${API_BASE_URL}/labels/create/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error('Failed to create label');
  return res.json();
};

export const setDocumentLabels = async (documentId: number, labelIds: string[]): Promise<unknown> => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/labels/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label_ids: labelIds }) });
  if (!res.ok) throw new Error('Failed to set labels');
  return res.json();
};

// Collections
export const listCollections = async (): Promise<Collection[]> => {
  const res = await fetch(`${API_BASE_URL}/collections/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load collections');
  return res.json();
};

export const createCollection = async (name: string, parent_id: number | null = null): Promise<Collection> => {
  const res = await fetch(`${API_BASE_URL}/collections/create/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, parent_id }) });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
};

export const updateCollection = async (collectionId: number, name: string): Promise<Collection> => {
  const res = await fetch(`${API_BASE_URL}/collections/${collectionId}/update/`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to update collection');
  return res.json();
};

export const setDocumentCollections = async (documentId: number, collectionIds: number[]): Promise<unknown> => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/collections/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ collection_ids: collectionIds }) });
  if (!res.ok) throw new Error('Failed to set collections');
  return res.json();
};

// Search
export const searchStandard = async (q: string, labelIds: string[] = []): Promise<Document[]> => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  labelIds.forEach(id => params.append('label_ids', id));
  const res = await fetch(`${API_BASE_URL}/search/standard/?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

export const searchDeep = async (q: string): Promise<Document[]> => {
  const res = await fetch(`${API_BASE_URL}/search/deep/?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Deep search failed');
  return res.json();
};

export const searchByQRFile = async (file: File): Promise<{ document: Document }> => {
  const fd = new FormData();
  fd.append('file', file);
  const t = getToken();
  const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};
  const res = await fetch(`${API_BASE_URL}/search/qr/`, { method: 'POST', headers, body: fd });
  if (!res.ok) throw new Error('QR search failed');
  return res.json();
};

/**
 * Get QR code system information
 */
export const getQRCodeInfo = async (): Promise<unknown> => {
  try {
    const response = await fetch(`${API_BASE_URL}/qr-codes/info/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching QR code info:', error);
    throw error;
  }
};

/**
 * Create document from HTML content (for manual document creation)
 */
export const createDocumentFromHTML = async (title: string, htmlContent: string): Promise<Document> => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('html', htmlContent);

    const t = getToken();
    const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating document from HTML:', error);
    throw error;
  }
};

/**
 * Create document from OCR scan
 */
export const createDocumentFromOCR = async (
  title: string,
  file: File,
  extractedText: string = '',
  htmlContent: string = ''
): Promise<Document & { ocr_text?: string; created_from_ocr?: boolean }> => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);
    formData.append('is_ocr', 'true');

    if (htmlContent) {
      formData.append('html', htmlContent);
    }

    const t = getToken();
    const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const document = await response.json();

    return {
      ...document,
      ocr_text: extractedText,
      created_from_ocr: true
    };
  } catch (error) {
    console.error('Error creating document from OCR:', error);
    throw error;
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format date for display
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// ============ GROUP MANAGEMENT ============

export const listGroups = async (): Promise<Group[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching groups:', error);
    throw error;
  }
};

export const createGroup = async (name: string): Promise<Group> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating group:', error);
    throw error;
  }
};

export const getGroup = async (groupId: string): Promise<Group> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching group:', error);
    throw error;
  }
};

export const updateGroup = async (groupId: string, name: string): Promise<Group> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating group:', error);
    throw error;
  }
};

export const deleteGroup = async (groupId: number): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
};

export const getGroupMembers = async (groupId: number): Promise<GroupMember[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/members/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching group members:', error);
    throw error;
  }
};

export const addGroupMembers = async (groupId: number, userIds: number[]): Promise<unknown> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/members/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ user_ids: userIds }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding group members:', error);
    throw error;
  }
};

export const removeGroupMember = async (groupId: number, userId: number): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/members/${userId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error removing group member:', error);
    throw error;
  }
};

// ============ SHARE LINKS ============

export const getDocumentShareLinks = async (documentId: string | number): Promise<ShareLink[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/share-links/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching share links:', error);
    throw error;
  }
};

export const createShareLink = async (
  documentId: string | number,
  expiresAt?: string | null
): Promise<ShareLink> => {
  try {
    const body: { expires_at?: string } = {};
    if (expiresAt) {
      body.expires_at = expiresAt;
    }

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/share-links/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating share link:', error);
    throw error;
  }
};

export const revokeShareLink = async (shareLinkId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/share-links/${shareLinkId}/revoke/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error revoking share link:', error);
    throw error;
  }
};

export const accessDocumentViaShareLink = async (token: string): Promise<ShareLinkAccess> => {
  try {
    const response = await fetch(`${API_BASE_URL}/share-links/${token}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error accessing document via share link:', error);
    throw error;
  }
};

// === AUDIT LOGGING AND VERSION HISTORY ===

export const getDocumentAuditLog = async (
  documentId: string | number,
  page: number = 1,
  pageSize: number = 50
): Promise<AuditLogResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/audit/?page=${page}&page_size=${pageSize}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching document audit log:', error);
    throw error;
  }
};

export const getDocumentVersionHistory = async (documentId: string | number): Promise<DocumentVersion[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/versions/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching document version history:', error);
    throw error;
  }
};

export const getDocumentVersionDetail = async (documentId: string | number, versionId: string): Promise<DocumentVersion> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/versions/${versionId}/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching document version detail:', error);
    throw error;
  }
};

export const restoreDocumentVersion = async (
  documentId: string | number,
  versionId: string,
  changeNote: string = ''
): Promise<Document> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/restore/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        version_id: versionId,
        change_note: changeNote
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error restoring document version:', error);
    throw error;
  }
};

// ============ ADDITIONAL COLLECTIONS MANAGEMENT ============

export const getCollectionDetail = async (collectionId: number): Promise<Collection> => {
  try {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching collection details:', error);
    throw error;
  }
};

export const deleteCollection = async (collectionId: number): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/delete/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting collection:', error);
    throw error;
  }
};

// ============ USER PROFILE & SETTINGS ============

export const getUserProfile = async (): Promise<UserProfile> => {
  const res = await fetch(`${API_BASE_URL}/auth/profile/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
};

export const updateUserProfile = async (email: string): Promise<UserProfile> => {
  const res = await fetch(`${API_BASE_URL}/auth/profile/`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<{ message: string; token: string }> => {
  const res = await fetch(`${API_BASE_URL}/auth/change-password/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to change password');
  }
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  return data;
};

export const uploadAvatar = async (file: File): Promise<{ avatar_url: string }> => {
  const fd = new FormData();
  fd.append('avatar', file);
  const t = getToken();
  const headers: HeadersInit = t ? { Authorization: `Token ${t}` } : {};
  const res = await fetch(`${API_BASE_URL}/auth/avatar/`, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to upload avatar');
  }
  return res.json();
};

// ============ ACL INLINE EDITING ============

export const updateShareRole = async (
  shareId: number | string,
  role: string
): Promise<{ id: string; role: string; message: string }> => {
  const res = await fetch(`${API_BASE_URL}/shares/${shareId}/`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update share role');
  return res.json();
};

// ============ GROUP DOCUMENTS ============

export interface GroupWithDocuments {
  id: number;
  name: string;
  document_count: number;
  member_count: number;
  is_owner: boolean;
  created_by_username: string | null;
}

export interface GroupDocument extends Document {
  group_role?: string;
}

export const getGroupsWithDocuments = async (): Promise<GroupWithDocuments[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/with-documents/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching groups with documents:', error);
    throw error;
  }
};

export const getGroupDocuments = async (groupId: number): Promise<GroupDocument[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/documents/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching group documents:', error);
    throw error;
  }
};

// ============ DOCUMENT ACL MANAGEMENT ============

export interface ACLEntry {
  id: string;
  subject_type: 'user' | 'group';
  subject_id: string;
  subject_name?: string;
  role: 'VIEWER' | 'EDITOR' | 'OWNER';
  expires_at: string | null;
  created_at: string;
}

export const getDocumentACLs = async (documentId: number): Promise<ACLEntry[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/acl/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching document ACLs:', error);
    throw error;
  }
};

export const createDocumentACL = async (
  documentId: number,
  subjectType: 'user' | 'group',
  subjectId: string | number,
  role: 'VIEWER' | 'EDITOR' | 'OWNER',
  expiresAt?: string | null
): Promise<ACLEntry> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/acl/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        subject_type: subjectType,
        subject_id: String(subjectId),
        role,
        expires_at: expiresAt || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating document ACL:', error);
    throw error;
  }
};

export const updateDocumentACL = async (
  documentId: number,
  aclId: string,
  role?: 'VIEWER' | 'EDITOR' | 'OWNER',
  expiresAt?: string | null
): Promise<ACLEntry> => {
  try {
    const body: Record<string, unknown> = {};
    if (role) body.role = role;
    if (expiresAt !== undefined) body.expires_at = expiresAt;

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/acl/${aclId}/`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating document ACL:', error);
    throw error;
  }
};

export const deleteDocumentACL = async (documentId: number, aclId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/acl/${aclId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting document ACL:', error);
    throw error;
  }
};

// --- Email Verification ---

export const verifyEmail = async (code: string): Promise<{ message: string; approval_status: string }> => {
  const res = await fetch(`${API_BASE_URL}/auth/verify-email/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Verification failed');
  }
  return res.json();
};

export const resendVerificationCode = async (): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE_URL}/auth/resend-verification/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to resend verification code');
  return res.json();
};

// --- Notifications ---

export const getNotifications = async (unreadOnly = false, page = 1): Promise<{ count: number; results: NotificationItem[] }> => {
  const params = new URLSearchParams({ page: String(page) });
  if (unreadOnly) params.set('unread', 'true');
  const res = await fetch(`${API_BASE_URL}/notifications/?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json();
};

export const getUnreadCount = async (): Promise<{ count: number }> => {
  const res = await fetch(`${API_BASE_URL}/notifications/unread-count/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to get unread count');
  return res.json();
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to mark notification as read');
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/notifications/read-all/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to mark all as read');
};

export const pollNotifications = async (since: string): Promise<{ notifications: NotificationItem[]; server_time: string }> => {
  const res = await fetch(`${API_BASE_URL}/notifications/poll/?since=${encodeURIComponent(since)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to poll notifications');
  return res.json();
};

// --- Admin ---

export const adminGetUsers = async (statusFilter?: string): Promise<AdminUser[]> => {
  const params = statusFilter ? `?status=${statusFilter}` : '';
  const res = await fetch(`${API_BASE_URL}/admin/users/${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load admin users');
  return res.json();
};

export const adminApproveUser = async (userId: number): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/approve/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to approve user');
  return res.json();
};

export const adminRejectUser = async (userId: number, reason: string): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/reject/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to reject user');
  return res.json();
};

export const adminDeleteUser = async (userId: number): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/delete/`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete user');
  return res.json();
};

export const adminResendVerification = async (userId: number): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/resend-verification/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to resend verification');
  return res.json();
};

export const adminGetACLs = async (filters?: { document_id?: number; user_id?: number; subject_type?: string; role?: string; search?: string; page?: number; page_size?: number }): Promise<PaginatedACLResponse> => {
  const params = new URLSearchParams();
  if (filters?.document_id) params.set('document_id', String(filters.document_id));
  if (filters?.user_id) params.set('user_id', String(filters.user_id));
  if (filters?.subject_type) params.set('subject_type', filters.subject_type);
  if (filters?.role) params.set('role', filters.role);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.page_size) params.set('page_size', String(filters.page_size));
  const res = await fetch(`${API_BASE_URL}/admin/acl/?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load admin ACLs');
  return res.json();
};

export const adminUpdateACL = async (aclId: string, data: { role?: string; expires_at?: string | null }): Promise<AdminACL> => {
  const res = await fetch(`${API_BASE_URL}/admin/acl/${aclId}/`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update ACL');
  return res.json();
};

export const adminDeleteACL = async (aclId: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/admin/acl/${aclId}/`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete ACL');
};

export const adminGetDashboardStats = async (): Promise<DashboardStats> => {
  const res = await fetch(`${API_BASE_URL}/admin/dashboard/stats/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load dashboard stats');
  return res.json();
};

export const adminGetGroups = async (): Promise<AdminGroup[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/groups/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load admin groups');
  return res.json();
};
