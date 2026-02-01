import React, { createContext, useContext, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Document, Label, Collection, Group, User, GroupMember, GroupWithDocuments, GroupDocument } from '../services/documentService';
import type { OCRResult } from '../services/ocrService';

// ---- Documents Page Cache ----
export interface DocumentsPageCache {
  pageCache: Map<number, Document[]>;
  currentPage: number;
  totalCount: number;
  totalPages: number;
  labels: Label[];
  collections: Collection[];
  timestamp: number;
}

// ---- Groups Page Cache ----
export interface GroupsPageCache {
  groups: Group[];
  users: User[];
  selectedGroupId: number | null;
  groupMembers: GroupMember[];
  timestamp: number;
}

// ---- Collections Page Cache ----
export interface CollectionsPageCache {
  collections: Collection[];
  documents: Document[];
  selectedCollectionId: number | null;
  collapsedNodes: number[];
  timestamp: number;
}

// ---- Group Documents Page Cache ----
export interface GroupDocumentsPageCache {
  groupsWithDocs: GroupWithDocuments[];
  selectedGroupId: number | null;
  documents: Record<number, GroupDocument[]>;
  timestamp: number;
}

// ---- OCR Page Cache ----
export interface OCRPageCache {
  ocrResult: OCRResult | null;
  fileName: string | null;
  editorContent: string | null;
  editorTitle: string | null;
  timestamp: number;
}

interface PageCacheContextValue {
  // Documents
  getDocumentsCache: () => DocumentsPageCache | null;
  setDocumentsCache: (cache: DocumentsPageCache) => void;
  clearDocumentsCache: () => void;

  // Groups
  getGroupsCache: () => GroupsPageCache | null;
  setGroupsCache: (cache: GroupsPageCache) => void;
  clearGroupsCache: () => void;

  // Collections
  getCollectionsCache: () => CollectionsPageCache | null;
  setCollectionsCache: (cache: CollectionsPageCache) => void;
  clearCollectionsCache: () => void;

  // Group Documents
  getGroupDocumentsCache: () => GroupDocumentsPageCache | null;
  setGroupDocumentsCache: (cache: GroupDocumentsPageCache) => void;
  clearGroupDocumentsCache: () => void;

  // OCR
  getOCRCache: () => OCRPageCache | null;
  setOCRCache: (cache: OCRPageCache) => void;
  clearOCRCache: () => void;

  // Clear all
  clearAllCaches: () => void;
}

const PageCacheContext = createContext<PageCacheContextValue | null>(null);

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const PageCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const documentsCacheRef = useRef<DocumentsPageCache | null>(null);
  const groupsCacheRef = useRef<GroupsPageCache | null>(null);
  const groupDocumentsCacheRef = useRef<GroupDocumentsPageCache | null>(null);
  const collectionsCacheRef = useRef<CollectionsPageCache | null>(null);
  const ocrCacheRef = useRef<OCRPageCache | null>(null);

  const isFresh = (timestamp: number): boolean => Date.now() - timestamp < CACHE_TTL;

  // Documents
  const getDocumentsCache = useCallback((): DocumentsPageCache | null => {
    const cache = documentsCacheRef.current;
    if (cache && isFresh(cache.timestamp)) return cache;
    return null;
  }, []);

  const setDocumentsCache = useCallback((cache: DocumentsPageCache) => {
    documentsCacheRef.current = cache;
  }, []);

  const clearDocumentsCache = useCallback(() => {
    documentsCacheRef.current = null;
  }, []);

  // Groups
  const getGroupsCache = useCallback((): GroupsPageCache | null => {
    const cache = groupsCacheRef.current;
    if (cache && isFresh(cache.timestamp)) return cache;
    return null;
  }, []);

  const setGroupsCache = useCallback((cache: GroupsPageCache) => {
    groupsCacheRef.current = cache;
  }, []);

  const clearGroupsCache = useCallback(() => {
    groupsCacheRef.current = null;
  }, []);

  // Group Documents
  const getGroupDocumentsCache = useCallback((): GroupDocumentsPageCache | null => {
    const cache = groupDocumentsCacheRef.current;
    if (cache && isFresh(cache.timestamp)) return cache;
    return null;
  }, []);

  const setGroupDocumentsCache = useCallback((cache: GroupDocumentsPageCache) => {
    groupDocumentsCacheRef.current = cache;
  }, []);

  const clearGroupDocumentsCache = useCallback(() => {
    groupDocumentsCacheRef.current = null;
  }, []);

  // Collections
  const getCollectionsCache = useCallback((): CollectionsPageCache | null => {
    const cache = collectionsCacheRef.current;
    if (cache && isFresh(cache.timestamp)) return cache;
    return null;
  }, []);

  const setCollectionsCache = useCallback((cache: CollectionsPageCache) => {
    collectionsCacheRef.current = cache;
  }, []);

  const clearCollectionsCache = useCallback(() => {
    collectionsCacheRef.current = null;
  }, []);

  // OCR
  const getOCRCache = useCallback((): OCRPageCache | null => {
    const cache = ocrCacheRef.current;
    if (cache && isFresh(cache.timestamp)) return cache;
    return null;
  }, []);

  const setOCRCache = useCallback((cache: OCRPageCache) => {
    ocrCacheRef.current = cache;
  }, []);

  const clearOCRCache = useCallback(() => {
    ocrCacheRef.current = null;
  }, []);

  const clearAllCaches = useCallback(() => {
    documentsCacheRef.current = null;
    groupsCacheRef.current = null;
    groupDocumentsCacheRef.current = null;
    collectionsCacheRef.current = null;
    ocrCacheRef.current = null;
  }, []);

  const value: PageCacheContextValue = {
    getDocumentsCache, setDocumentsCache, clearDocumentsCache,
    getGroupsCache, setGroupsCache, clearGroupsCache,
    getGroupDocumentsCache, setGroupDocumentsCache, clearGroupDocumentsCache,
    getCollectionsCache, setCollectionsCache, clearCollectionsCache,
    getOCRCache, setOCRCache, clearOCRCache,
    clearAllCaches,
  };

  return (
    <PageCacheContext.Provider value={value}>
      {children}
    </PageCacheContext.Provider>
  );
};

export const usePageCache = (): PageCacheContextValue => {
  const ctx = useContext(PageCacheContext);
  if (!ctx) throw new Error('usePageCache must be used within a PageCacheProvider');
  return ctx;
};
