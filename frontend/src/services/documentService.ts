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
  id: number;
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
  username?: string;
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
export const getDocumentsPaginated = async (page: number = 1): Promise<PaginatedResponse<Document>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/?page=${page}`, {
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

export const setDocumentLabels = async (documentId: number, labelIds: number[]): Promise<unknown> => {
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

export const setDocumentCollections = async (documentId: number, collectionIds: number[]): Promise<unknown> => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/collections/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ collection_ids: collectionIds }) });
  if (!res.ok) throw new Error('Failed to set collections');
  return res.json();
};

// Search
export const searchStandard = async (q: string, labelIds: number[] = []): Promise<Document[]> => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  labelIds.forEach(id => params.append('label_ids', String(id)));
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
  role: string,
  expiresAt: string | null = null
): Promise<ShareLink> => {
  try {
    const body: { role: string; expires_at?: string } = { role };
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
