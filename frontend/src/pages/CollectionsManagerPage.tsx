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
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.id);
  
  useEffect(() => {
    if (selectedId === node.id && !details && !loadingDetails) {
      setLoadingDetails(true);
      getCollectionDetail(node.id)
        .then((data) => setDetails(data as CollectionDetail))
        .catch(console.error)
        .finally(() => setLoadingDetails(false));
    }
  }, [selectedId, node.id, details, loadingDetails]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
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
    <div style={{ marginLeft: level * 16 }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          padding: '4px 0',
          borderRadius: '4px',
          backgroundColor: selectedId === node.id ? '#e3f2fd' : 'transparent',
          border: selectedId === node.id ? '1px solid #2196f3' : '1px solid transparent',
        }}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
      >
        {hasChildren && (
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              marginRight: '4px',
              fontSize: '12px',
              color: '#666'
            }}
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        )}
        
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            flexGrow: 1,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: selectedId === node.id ? '#1976d2' : '#333',
            fontWeight: selectedId === node.id ? '500' : '400',
          }}
          onClick={handleSelect}
          title="Drop documents here to add to this collection"
        >
          <span>📂</span>
          <span>{node.name}</span>
          {selectedId === node.id && details && (
            <span style={{ 
              fontSize: '11px', 
              color: '#666', 
              background: '#f5f5f5', 
              padding: '1px 4px', 
              borderRadius: '3px',
              marginLeft: '4px'
            }}>
              {details.document_count} docs
              {details.subcollection_count > 0 && `, ${details.subcollection_count} subs`}
            </span>
          )}
          {loadingDetails && selectedId === node.id && (
            <span style={{ fontSize: '10px', color: '#999' }}>⟳</span>
          )}
        </button>

        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: '#d32f2f',
            fontSize: '12px',
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          onClick={handleDelete}
          title={`Delete collection "${node.name}" and all sub-collections`}
        >
          🗑️
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
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '500px',
        width: '90%'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#d32f2f' }}>{title}</h3>
        <p style={{ margin: '0 0 12px 0', lineHeight: '1.5' }}>{message}</p>
        {details && (
          <div style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '12px', 
            borderRadius: '4px', 
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            {details}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button 
            className="btn btn-secondary" 
            onClick={onCancel}
            style={{ minWidth: '80px' }}
          >
            Cancel
          </button>
          <button 
            className="btn"
            onClick={onConfirm}
            style={{ 
              minWidth: '80px',
              backgroundColor: '#d32f2f', 
              color: 'white', 
              border: 'none' 
            }}
          >
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
        ? `⚠️ Warning: This will delete ${totalCollections} collection${totalCollections === 1 ? '' : 's'} in total.`
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
    <div className="collections-manager" style={{ padding: 16 }}>
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2>🗂️ Collections Manager</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/documents" className="btn">Back to Documents</Link>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>⟳</div>
          <p>Loading collections and documents...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ 
            border: '1px solid #ddd', 
            borderRadius: 8, 
            padding: 16, 
            backgroundColor: '#fafafa',
            minHeight: 400 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>Collections Tree</strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={expandAll}
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  title="Expand all collections"
                >
                  📂 Expand All
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={collapseAll}
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  title="Collapse all collections"
                >
                  📁 Collapse All
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setSelectedCollectionId(null)} 
                  title="Show all documents"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                >
                  🔄 Show All
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16, maxHeight: 300, overflowY: 'auto', backgroundColor: 'white', padding: 8, borderRadius: 4, border: '1px solid #eee' }}>
              {tree.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                  <p>📂 No collections yet</p>
                  <p style={{ fontSize: 14, margin: 0 }}>Create your first collection below</p>
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

            <div style={{ borderTop: '1px solid #ddd', paddingTop: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 14, color: '#333' }}>
                  {selectedCollection 
                    ? `➕ Add sub-collection under "${selectedCollection.name}"` 
                    : '➕ Add top-level collection'
                  }
                </strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  placeholder="New collection name" 
                  value={newSubName} 
                  onChange={e => setNewSubName(e.target.value)}
                  style={{ flexGrow: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc' }}
                  onKeyPress={handleKeyPress}
                />
                <button 
                  className="btn btn-primary" 
                  disabled={saving || !newSubName.trim()} 
                  onClick={onCreateSubCollection}
                  style={{ minWidth: 70 }}
                >
                  {saving ? '⟳' : 'Add'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <strong style={{ fontSize: 16 }}>
                  {selectedCollection ? `📄 Documents in "${selectedCollection.name}"` : '📄 All Documents'}
                </strong>
                <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                  {documentsInSelected.length} document{documentsInSelected.length === 1 ? '' : 's'}
                  {selectedCollection && (
                    <span style={{ marginLeft: 8 }}>
                      💡 Drag documents from below onto collections on the left to organize them
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: 12,
              maxHeight: 500,
              overflowY: 'auto',
              backgroundColor: 'white',
              padding: 12,
              borderRadius: 4,
              border: '1px solid #eee'
            }}>
              {documentsInSelected.length === 0 ? (
                <div style={{ 
                  gridColumn: '1 / -1', 
                  textAlign: 'center', 
                  color: '#666', 
                  padding: 40 
                }}>
                  {selectedCollection ? (
                    <div>
                      <p>📭 No documents in this collection yet</p>
                      <p style={{ fontSize: 14 }}>Drag documents from other collections to add them here</p>
                    </div>
                  ) : (
                    <div>
                      <p>📄 No documents found</p>
                      <Link to="/ocr" style={{ fontSize: 14 }}>Create your first document</Link>
                    </div>
                  )}
                </div>
              ) : (
                documentsInSelected.map(doc => (
                  <div 
                    key={doc.id} 
                    style={{ 
                      padding: 12, 
                      border: '1px solid #eee', 
                      borderRadius: 8, 
                      backgroundColor: 'white',
                      cursor: 'grab',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }} 
                    draggable 
                    onDragStart={(e) => onDragStartDoc(e, doc.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong title={doc.title} style={{ fontSize: 14, color: '#333' }}>
                        {doc.title.length > 25 ? doc.title.substring(0, 25) + '...' : doc.title}
                      </strong>
                      <span style={{ cursor: 'grab', color: '#999' }} title="Drag to a collection">⋮⋮</span>
                    </div>
                    
                    <div style={{ marginBottom: 10, minHeight: 20 }}>
                      {Array.isArray(doc.collections) && doc.collections.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {doc.collections.slice(0, 3).map(c => (
                            <span key={c.id} style={{ 
                              fontSize: 11, 
                              background: '#e3f2fd', 
                              color: '#1976d2', 
                              padding: '2px 6px', 
                              borderRadius: 12 
                            }}>
                              {c.name}
                            </span>
                          ))}
                          {doc.collections.length > 3 && (
                            <span style={{ 
                              fontSize: 11, 
                              color: '#666',
                              padding: '2px 6px'
                            }}>
                              +{doc.collections.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                          No collections
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Link 
                        to={`/documents/${doc.id}`} 
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                      >
                        📝 Edit
                      </Link>
                      {doc.qr_code_url && (
                        <a 
                          className="btn" 
                          href={doc.qr_code_url} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                        >
                          📱 QR
                        </a>
                      )}
                      {doc.file_url && (
                        <a 
                          className="btn" 
                          href={doc.file_url} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                        >
                          📄 File
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
            <p>Processing...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionsManagerPage;
