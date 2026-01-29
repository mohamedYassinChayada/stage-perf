import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import {
  listCollections,
  createCollection,
  deleteCollection,
  getCollectionDetail,
  setDocumentCollections,
  getAllDocuments,
} from '../services/documentService';
import type { Document, Collection, CollectionDetail } from '../services/documentService';
import { Link } from 'react-router-dom';
import './CollectionsManagerPage.css';

interface CollectionNode extends Collection {
  children: CollectionNode[];
}

const buildCollectionTree = (collections: Collection[]): CollectionNode[] => {
  const idToNode = new Map<number, CollectionNode>();
  collections.forEach(c => idToNode.set(c.id, { ...c, children: [] }));
  const roots: CollectionNode[] = [];
  collections.forEach(c => {
    const node = idToNode.get(c.id)!;
    if (c.parent_id && idToNode.has(c.parent_id)) {
      idToNode.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

interface CollectionNodeProps {
  node: CollectionNode;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDropDocument: (docId: number, collectionId: number) => void;
  onDelete: (node: CollectionNode) => void;
  collapsedNodes: Set<number>;
  onToggleCollapse: (id: number) => void;
  level?: number;
}

const CollectionNodeComponent: React.FC<CollectionNodeProps> = ({
  node,
  selectedId,
  onSelect,
  onDropDocument,
  onDelete,
  collapsedNodes,
  onToggleCollapse,
  level = 0
}) => {
  const [details, setDetails] = useState<CollectionDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.id);
  const isSelected = selectedId === node.id;

  useEffect(() => {
    if (isSelected && !details && !loadingDetails) {
      setLoadingDetails(true);
      getCollectionDetail(node.id)
        .then((data) => setDetails(data as CollectionDetail))
        .catch(console.error)
        .finally(() => setLoadingDetails(false));
    }
  }, [selectedId, node.id, details, loadingDetails, isSelected]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (): void => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
    const docId = e.dataTransfer.getData('text/doc-id');
    if (docId) onDropDocument(parseInt(docId, 10), node.id);
  };

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onToggleCollapse(node.id);
  };

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onDelete(node);
  };

  const handleSelect = (): void => {
    onSelect(node.id);
  };

  return (
    <div style={{ marginLeft: level * 18 }}>
      <div
        className={`collections-tree-node ${isSelected ? 'selected' : ''}`}
        style={isDragOver ? { background: '#dbeafe', borderColor: '#3b82f6' } : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {hasChildren && (
          <button
            className="collections-tree-toggle"
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
        )}

        <button className="collections-tree-name" onClick={handleSelect}>
          <span>{isCollapsed ? '\uD83D\uDCC1' : '\uD83D\uDCC2'}</span>
          <span>{node.name}</span>
          {isSelected && details && (
            <span className="collections-tree-badge">
              {details.document_count} docs
              {details.subcollection_count > 0 && `, ${details.subcollection_count} subs`}
            </span>
          )}
          {loadingDetails && isSelected && (
            <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>\u27F3</span>
          )}
        </button>

        <button
          className="collections-tree-delete"
          onClick={handleDelete}
          title={`Delete collection "${node.name}" and all sub-collections`}
        >
          \uD83D\uDDD1\uFE0F
        </button>
      </div>

      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map(child => (
            <CollectionNodeComponent
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onDropDocument={onDropDocument}
              onDelete={onDelete}
              collapsedNodes={collapsedNodes}
              onToggleCollapse={onToggleCollapse}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ConfirmationDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  details?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ isOpen, title, message, details, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="collections-dialog-overlay">
      <div className="collections-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        {details && (
          <div className="collections-dialog-details">
            {details}
          </div>
        )}
        <div className="collections-dialog-actions">
          <button className="collections-dialog-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="collections-dialog-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteConfirmation {
  node: CollectionNode;
  title: string;
  message: string;
  details: string | null;
}

const CollectionsManagerPage: React.FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);

  const tree = useMemo(() => buildCollectionTree(collections), [collections]);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [cols, docs] = await Promise.all([listCollections(), getAllDocuments()]);
      setCollections(cols || []);
      setDocuments(docs || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectedCollection = useMemo(
    () => collections.find(c => c.id === selectedCollectionId) || null,
    [collections, selectedCollectionId]
  );

  const documentsInSelected = useMemo(() => {
    if (!selectedCollectionId) return documents;
    return documents.filter(d =>
      Array.isArray(d.collections) &&
      d.collections.some(c => c.id === selectedCollectionId)
    );
  }, [documents, selectedCollectionId]);

  const onDragStartDoc = (e: DragEvent<HTMLDivElement>, docId: number): void => {
    e.dataTransfer.setData('text/doc-id', String(docId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropDocument = async (docId: number, targetCollectionId: number): Promise<void> => {
    try {
      setSaving(true);
      const doc = documents.find(d => d.id === docId);
      const existingIds = Array.isArray(doc?.collections) ? doc.collections.map(c => c.id) : [];
      if (existingIds.includes(targetCollectionId)) {
        setSaving(false);
        return;
      }
      const next = [...existingIds, targetCollectionId];
      await setDocumentCollections(docId, next);
      await loadAll();
    } catch (e) {
      alert((e as Error).message || 'Failed to assign document to collection');
    } finally {
      setSaving(false);
    }
  };

  const onCreateSubCollection = async (): Promise<void> => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      setSaving(true);
      await createCollection(name, selectedCollectionId || undefined);
      setNewSubName('');
      await loadAll();
    } catch (e) {
      alert((e as Error).message || 'Failed to create collection');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCollapse = (nodeId: number): void => {
    const newCollapsed = new Set(collapsedNodes);
    if (newCollapsed.has(nodeId)) {
      newCollapsed.delete(nodeId);
    } else {
      newCollapsed.add(nodeId);
    }
    setCollapsedNodes(newCollapsed);
  };

  const handleDeleteCollection = (node: CollectionNode): void => {
    const countDescendants = (n: CollectionNode): number => {
      let count = 1;
      if (n.children) {
        n.children.forEach(child => {
          count += countDescendants(child);
        });
      }
      return count;
    };

    const totalCollections = countDescendants(node);
    const hasSubCollections = node.children && node.children.length > 0;

    setDeleteConfirmation({
      node,
      title: `Delete Collection "${node.name}"?`,
      message: hasSubCollections
        ? `This will delete "${node.name}" and all ${totalCollections - 1} of its sub-collections. Documents will NOT be deleted, only unlinked from these collections.`
        : `This will delete the collection "${node.name}". Documents will NOT be deleted, only unlinked from this collection.`,
      details: hasSubCollections
        ? `Warning: This will delete ${totalCollections} collection${totalCollections === 1 ? '' : 's'} in total.`
        : null
    });
  };

  const confirmDeleteCollection = async (): Promise<void> => {
    if (!deleteConfirmation) return;

    try {
      setSaving(true);
      await deleteCollection(deleteConfirmation.node.id);

      if (selectedCollectionId === deleteConfirmation.node.id) {
        setSelectedCollectionId(null);
      }

      await loadAll();

      alert(`Collection "${deleteConfirmation.node.name}" deleted successfully!`);
    } catch (error) {
      alert('Failed to delete collection: ' + (error as Error).message);
    } finally {
      setSaving(false);
      setDeleteConfirmation(null);
    }
  };

  const cancelDeleteCollection = (): void => {
    setDeleteConfirmation(null);
  };

  const expandAll = (): void => {
    setCollapsedNodes(new Set());
  };

  const collapseAll = (): void => {
    const allNodeIds = new Set<number>();
    const collectIds = (nodes: CollectionNode[]): void => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          allNodeIds.add(node.id);
          collectIds(node.children);
        }
      });
    };
    collectIds(tree);
    setCollapsedNodes(allNodeIds);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !saving && newSubName.trim()) {
      onCreateSubCollection();
    }
  };

  return (
    <div className="collections-page">
      <header className="collections-page-header">
        <h2>Collections Manager</h2>
        <Link to="/documents" className="btn">Back to Documents</Link>
      </header>

      {loading ? (
        <div className="collections-loading">
          <div className="collections-loading-spinner"></div>
          <p>Loading collections and documents...</p>
        </div>
      ) : (
        <div className="collections-layout">
          {/* Tree Panel */}
          <div className="collections-tree-panel">
            <div className="collections-tree-header">
              <h3>Collections Tree</h3>
              <div className="collections-tree-actions">
                <button className="collections-tree-action-btn" onClick={expandAll} title="Expand all collections">
                  Expand All
                </button>
                <button className="collections-tree-action-btn" onClick={collapseAll} title="Collapse all collections">
                  Collapse All
                </button>
                <button className="collections-tree-action-btn" onClick={() => setSelectedCollectionId(null)} title="Show all documents">
                  Show All
                </button>
              </div>
            </div>

            <div className="collections-tree-body">
              {tree.length === 0 ? (
                <div className="collections-tree-empty">
                  <p>No collections yet</p>
                  <p>Create your first collection below</p>
                </div>
              ) : (
                tree.map(node => (
                  <CollectionNodeComponent
                    key={node.id}
                    node={node}
                    selectedId={selectedCollectionId}
                    onSelect={setSelectedCollectionId}
                    onDropDocument={handleDropDocument}
                    onDelete={handleDeleteCollection}
                    collapsedNodes={collapsedNodes}
                    onToggleCollapse={handleToggleCollapse}
                  />
                ))
              )}
            </div>

            <div className="collections-create-section">
              <span className="collections-create-label">
                {selectedCollection
                  ? `Add sub-collection under "${selectedCollection.name}"`
                  : 'Add top-level collection'
                }
              </span>
              <div className="collections-create-form">
                <input
                  className="collections-create-input"
                  placeholder="New collection name"
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <button
                  className="collections-create-btn"
                  disabled={saving || !newSubName.trim()}
                  onClick={onCreateSubCollection}
                >
                  {saving ? '\u27F3' : 'Add'}
                </button>
              </div>
            </div>
          </div>

          {/* Documents Panel */}
          <div className="collections-docs-panel">
            <div className="collections-docs-header">
              <h3>
                {selectedCollection ? `Documents in "${selectedCollection.name}"` : 'All Documents'}
              </h3>
              <p className="collections-docs-subtitle">
                {documentsInSelected.length} document{documentsInSelected.length === 1 ? '' : 's'}
                {selectedCollection && (
                  <span className="collections-docs-hint">
                    Drag documents onto collections to organize them
                  </span>
                )}
              </p>
            </div>

            <div className="collections-docs-grid">
              {documentsInSelected.length === 0 ? (
                <div className="collections-docs-empty">
                  {selectedCollection ? (
                    <>
                      <p>No documents in this collection yet</p>
                      <p style={{ fontSize: '0.85rem' }}>Drag documents from other collections to add them here</p>
                    </>
                  ) : (
                    <>
                      <p>No documents found</p>
                      <Link to="/ocr">Create your first document</Link>
                    </>
                  )}
                </div>
              ) : (
                documentsInSelected.map(doc => (
                  <div
                    key={doc.id}
                    className="collections-doc-card"
                    draggable
                    onDragStart={(e) => onDragStartDoc(e, doc.id)}
                  >
                    <div className="collections-doc-card-header">
                      <strong className="collections-doc-card-title" title={doc.title}>
                        {doc.title.length > 25 ? doc.title.substring(0, 25) + '...' : doc.title}
                      </strong>
                      <span className="collections-doc-card-drag" title="Drag to a collection">{'\u22EE\u22EE'}</span>
                    </div>

                    <div className="collections-doc-card-tags">
                      {Array.isArray(doc.collections) && doc.collections.length > 0 ? (
                        <>
                          {doc.collections.slice(0, 3).map(c => (
                            <span key={c.id} className="collections-doc-tag">
                              {c.name}
                            </span>
                          ))}
                          {doc.collections.length > 3 && (
                            <span className="collections-doc-tag-more">
                              +{doc.collections.length - 3} more
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="collections-doc-no-tags">
                          No collections
                        </span>
                      )}
                    </div>

                    <div className="collections-doc-actions">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="collections-doc-action-btn"
                      >
                        Edit
                      </Link>
                      {doc.qr_code_url && (
                        <a
                          className="collections-doc-action-btn"
                          href={doc.qr_code_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          QR
                        </a>
                      )}
                      {doc.file_url && (
                        <a
                          className="collections-doc-action-btn"
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          File
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!deleteConfirmation}
        title={deleteConfirmation?.title}
        message={deleteConfirmation?.message}
        details={deleteConfirmation?.details}
        onConfirm={confirmDeleteCollection}
        onCancel={cancelDeleteCollection}
      />

      {saving && (
        <div className="collections-saving-overlay">
          <div className="collections-saving-content">
            <div className="collections-saving-spinner"></div>
            <p>Processing...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionsManagerPage;
