/**
 * Document management service for handling API calls to the Django backend
 */

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const getToken = () => localStorage.getItem('token');
const authHeaders = () => {
  const h = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Token ${t}`;
  return h;
};

/**
 * Get all documents with their QR codes
 * @returns {Promise<Array>} Array of document objects
 */
export const getAllDocuments = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
};

/**
 * Get a specific document by ID
 * @param {number} documentId - The ID of the document
 * @returns {Promise<Object>} Document object
 */
export const getDocument = async (documentId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`);
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
 * @param {string} title - Document title
 * @param {File} file - Document file
 * @returns {Promise<Object>} Created document object
 */
export const createDocument = async (title, file) => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers: (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })(),
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
 * @param {number} documentId - The ID of the document to update
 * @param {string} title - New document title
 * @param {File} file - New document file (optional)
 * @returns {Promise<Object>} Updated document object
 */
export const updateDocument = async (documentId, title, file = null) => {
  try {
    const formData = new FormData();
    formData.append('title', title);
    if (file) {
      formData.append('file', file);
    }

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
      method: 'PUT',
      headers: (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })(),
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
 * @param {number} documentId - The ID of the document to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteDocument = async (documentId) => {
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
 * @param {number} documentId - The ID of the document
 * @returns {string} QR code image URL
 */
export const getQRCodeUrl = (documentId) => {
  return `${API_BASE_URL}/documents/${documentId}/qrcode/`;
};

// Update HTML content only
export const updateDocumentHtml = async (documentId, title, html) => {
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/`, {
    method: 'PUT',
    headers: (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })(),
    body: (() => { const fd = new FormData(); fd.append('title', title); fd.append('html', html); return fd; })(),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return await response.json();
};

// Auth helpers (minimal)
export const register = async (username, password, email) => {
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

export const me = async () => {
  const res = await fetch(`${API_BASE_URL}/auth/me/`, { headers: authHeaders() });
  return res.json();
};

export const login = async (username, password) => {
  const res = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  return data;
};

export const logout = async () => {
  const res = await fetch(`${API_BASE_URL}/auth/logout/`, { method: 'POST', headers: authHeaders() });
  localStorage.removeItem('token');
  return res.ok;
};

// ACL/Sharing
export const listShares = async (documentId) => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/shares/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load shares');
  return res.json();
};

export const addShare = async (documentId, subjectType, subjectId, role, expiresAt = null) => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/share/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, role, expires_at: expiresAt })
  });
  if (!res.ok) throw new Error('Failed to add share');
  return res.json();
};

export const listUsers = async () => {
  const res = await fetch(`${API_BASE_URL}/auth/users/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
};

export const deleteShare = async (shareId) => {
  const res = await fetch(`${API_BASE_URL}/shares/${shareId}/`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to delete share');
  return true;
};

// Labels
export const listLabels = async () => {
  const res = await fetch(`${API_BASE_URL}/labels/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load labels');
  return res.json();
};

export const createLabel = async (name) => {
  const res = await fetch(`${API_BASE_URL}/labels/create/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error('Failed to create label');
  return res.json();
};

export const setDocumentLabels = async (documentId, labelIds) => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/labels/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label_ids: labelIds }) });
  if (!res.ok) throw new Error('Failed to set labels');
  return res.json();
};

// Collections
export const listCollections = async () => {
  const res = await fetch(`${API_BASE_URL}/collections/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load collections');
  return res.json();
};

export const createCollection = async (name, parent_id = null) => {
  const res = await fetch(`${API_BASE_URL}/collections/create/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, parent_id }) });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
};

export const setDocumentCollections = async (documentId, collectionIds) => {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/collections/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ collection_ids: collectionIds }) });
  if (!res.ok) throw new Error('Failed to set collections');
  return res.json();
};

// Search
export const searchStandard = async (q, labelIds = []) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  labelIds.forEach(id => params.append('label_ids', id));
  const res = await fetch(`${API_BASE_URL}/search/standard/?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

export const searchDeep = async (q) => {
  const res = await fetch(`${API_BASE_URL}/search/deep/?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Deep search failed');
  return res.json();
};

export const searchByQRFile = async (file) => {
  const fd = new FormData(); fd.append('file', file);
  const headers = (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })();
  const res = await fetch(`${API_BASE_URL}/search/qr/`, { method: 'POST', headers, body: fd });
  if (!res.ok) throw new Error('QR search failed');
  return res.json();
};

/**
 * Get QR code system information
 * @returns {Promise<Object>} QR code system info
 */
export const getQRCodeInfo = async () => {
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
 * @param {string} title - Document title
 * @param {string} htmlContent - HTML content from editor
 * @returns {Promise<Object>} Created document object
 */
export const createDocumentFromHTML = async (title, htmlContent) => {
  try {
    // Create FormData to match Django endpoint expectations
    const formData = new FormData();
    formData.append('title', title);
    formData.append('html', htmlContent);

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers: (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })(),
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
 * @param {string} title - Document title
 * @param {File} file - Scanned image/PDF file
 * @param {string} extractedText - Text extracted from OCR (optional)
 * @param {string} htmlContent - HTML content from OCR for editor (optional)
 * @returns {Promise<Object>} Created document with OCR data
 */
export const createDocumentFromOCR = async (title, file, extractedText = '', htmlContent = '') => {
  try {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);
    
    // Include HTML content if available
    if (htmlContent) {
      formData.append('html', htmlContent);
    }

    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: 'POST',
      headers: (()=>{ const t=getToken(); return t? { Authorization: `Token ${t}` } : {}; })(),
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const document = await response.json();
    
    // Return document with OCR text metadata
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
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
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

/**
 * Get all groups the user has access to
 * @returns {Promise<Array>} Array of group objects
 */
export const listGroups = async () => {
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

/**
 * Create a new group
 * @param {string} name - Group name
 * @returns {Promise<Object>} Created group object
 */
export const createGroup = async (name) => {
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

/**
 * Get group details
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Group object
 */
export const getGroup = async (groupId) => {
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

/**
 * Update group details
 * @param {string} groupId - Group ID
 * @param {string} name - New group name
 * @returns {Promise<Object>} Updated group object
 */
export const updateGroup = async (groupId, name) => {
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

/**
 * Delete a group
 * @param {string} groupId - Group ID
 * @returns {Promise<void>}
 */
export const deleteGroup = async (groupId) => {
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

/**
 * Get group members
 * @param {string} groupId - Group ID
 * @returns {Promise<Array>} Array of user objects
 */
export const getGroupMembers = async (groupId) => {
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

/**
 * Add users to a group
 * @param {string} groupId - Group ID
 * @param {Array<number>} userIds - Array of user IDs to add
 * @returns {Promise<Object>} Response object
 */
export const addGroupMembers = async (groupId, userIds) => {
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

/**
 * Remove a user from a group
 * @param {string} groupId - Group ID
 * @param {number} userId - User ID to remove
 * @returns {Promise<void>}
 */
export const removeGroupMember = async (groupId, userId) => {
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

/**
 * Get share links for a document
 * @param {number} documentId - Document ID
 * @returns {Promise<Array>} Array of share link objects
 */
export const getDocumentShareLinks = async (documentId) => {
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

/**
 * Create a share link for a document
 * @param {number} documentId - Document ID
 * @param {string} role - Role to assign (VIEWER, EDITOR, OWNER)
 * @param {string} expiresAt - Optional expiry date (ISO string)
 * @returns {Promise<Object>} Created share link object
 */
export const createShareLink = async (documentId, role, expiresAt = null) => {
  try {
    const body = { role };
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

/**
 * Revoke a share link
 * @param {string} shareLinkId - Share link ID
 * @returns {Promise<void>}
 */
export const revokeShareLink = async (shareLinkId) => {
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

/**
 * Access a document via share link token
 * @param {string} token - Share link token
 * @returns {Promise<Object>} Document access object
 */
export const accessDocumentViaShareLink = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/share-links/${token}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }, // No auth required
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

/**
 * Get audit log for a document
 * @param {number} documentId - Document ID
 * @param {number} page - Page number (default: 1)
 * @param {number} pageSize - Page size (default: 50)
 * @returns {Promise<Object>} Audit log entries with pagination info
 */
export const getDocumentAuditLog = async (documentId, page = 1, pageSize = 50) => {
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

/**
 * Get version history for a document
 * @param {number} documentId - Document ID
 * @returns {Promise<Array>} Array of document versions
 */
export const getDocumentVersionHistory = async (documentId) => {
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

/**
 * Get detailed content for a specific document version
 * @param {number} documentId - Document ID
 * @param {string} versionId - Version ID (UUID)
 * @returns {Promise<Object>} Document version details
 */
export const getDocumentVersionDetail = async (documentId, versionId) => {
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

/**
 * Restore document to a previous version
 * @param {number} documentId - Document ID
 * @param {string} versionId - Version ID to restore to
 * @param {string} changeNote - Optional note about the restoration
 * @returns {Promise<Object>} Updated document
 */
export const restoreDocumentVersion = async (documentId, versionId, changeNote = '') => {
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

/**
 * Get collection details including document count
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Object>} Collection details
 */
export const getCollectionDetail = async (collectionId) => {
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

/**
 * Delete a collection and all its sub-collections
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteCollection = async (collectionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/delete/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    // Handle both 204 (no content) and 200 responses
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting collection:', error);
    throw error;
  }
};