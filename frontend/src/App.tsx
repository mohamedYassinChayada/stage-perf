import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import './App.css';
import WordLikeEditor from './components/WordLikeEditor';
import type { WordLikeEditorHandle } from './components/WordLikeEditor';
import OCRPage from './pages/OCRPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentEditorPage from './pages/DocumentEditorPage';
import AuthPage from './pages/AuthPage';
import { me, logout, createDocumentFromHTML } from './services/documentService';
import { showSnackbar } from './components/Snackbar';
import UserMenu from './components/UserMenu';
import CollectionsManagerPage from './pages/CollectionsManagerPage';
import AccessManagementPage from './pages/AccessManagementPage';
import GroupsPage from './pages/GroupsPage';
import GroupDocumentsPage from './pages/GroupDocumentsPage';
import ShareLinkPage from './pages/ShareLinkPage';
import AuditLogPage from './pages/AuditLogPage';
import VersionHistoryPage from './pages/VersionHistoryPage';
import SettingsPage from './pages/SettingsPage';
import SnackbarContainer from './components/Snackbar';
import { PageCacheProvider, usePageCache } from './contexts/PageCacheContext';
import InactiveAccountBanner from './components/InactiveAccountBanner';
import NotificationBell from './components/NotificationBell';
import NotificationsPage from './pages/NotificationsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

interface UserInfo {
  authenticated: boolean;
  username: string;
  email?: string;
  avatar_url?: string | null;
  is_admin?: boolean;
  approval_status?: string;
}

// Navigation component
const Navigation: React.FC = () => {
  const location = useLocation();
  const [user, setUser] = React.useState<UserInfo | null>(null);
  const { clearAllCaches } = usePageCache();

  React.useEffect(() => {
    (async () => {
      try {
        const info = await me();
        if (info && info.authenticated) setUser(info as UserInfo);
        else setUser(null);
      } catch {
        setUser(null);
      }
    })();
  }, [location.pathname]);

  const onLogout = async (): Promise<void> => {
    try {
      await logout();
    } finally {
      clearAllCaches();
      localStorage.removeItem('token');
      setUser(null);
      window.location.href = '/auth';
    }
  };

  const isApproved = !user || user.approval_status === 'approved' || !user.approval_status;

  return (
    <>
      <nav className="app-navigation">
        <div className="nav-brand" />
        <div className="nav-links">
          {isApproved && (
            <>
              <Link
                to="/"
                className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
              >
                Document Editor
              </Link>
              <Link
                to="/ocr"
                className={`nav-link ${location.pathname === '/ocr' ? 'active' : ''}`}
              >
                OCR Editor
              </Link>
              <Link
                to="/documents"
                className={`nav-link ${location.pathname === '/documents' ? 'active' : ''}`}
              >
                Documents & QR Codes
              </Link>
              <Link
                to="/collections"
                className={`nav-link ${location.pathname === '/collections' ? 'active' : ''}`}
              >
                Collections
              </Link>
              <Link
                to="/groups"
                className={`nav-link ${location.pathname === '/groups' ? 'active' : ''}`}
              >
                Groups
              </Link>
              <Link
                to="/group-documents"
                className={`nav-link ${location.pathname === '/group-documents' ? 'active' : ''}`}
              >
                Group Documents
              </Link>
              {user?.is_admin && (
                <Link
                  to="/admin"
                  className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
                >
                  Admin
                </Link>
              )}
            </>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {user?.authenticated && isApproved && (
            <NotificationBell />
          )}
          {user?.authenticated ? (
            <UserMenu
              username={user.username}
              email={user.email}
              avatarUrl={user.avatar_url}
              onLogout={onLogout}
            />
          ) : (
            <Link to="/auth" className="btn btn-primary">Login</Link>
          )}
        </div>
      </nav>
      {user?.authenticated && (
        <InactiveAccountBanner approvalStatus={user.approval_status} />
      )}
    </>
  );
};

// Home page component
const HomePage: React.FC = () => {
  const [isSaving, setIsSaving] = React.useState(false);
  const editorRef = React.useRef<WordLikeEditorHandle>(null);

  const saveDocument = async (): Promise<void> => {
    if (!editorRef.current) {
      showSnackbar('Editor not ready. Please try again.', 'error');
      return;
    }

    try {
      setIsSaving(true);

      const editorTitle = editorRef.current.getTitle();
      const finalTitle = editorTitle && editorTitle.trim() ? editorTitle : 'Untitled Document';
      const htmlContent = editorRef.current.getContent();

      if (!htmlContent || htmlContent.trim() === '' || htmlContent === '<div class="word-page" data-page="1"><div class="word-page-content"><p><br></p></div></div>') {
        showSnackbar('Document is empty. Please add some content before saving.', 'error');
        return;
      }

      const savedDocument = await createDocumentFromHTML(finalTitle, htmlContent);
      showSnackbar(`Document "${finalTitle}" saved successfully! (ID: ${savedDocument.id})`, 'success');

    } catch (err) {
      showSnackbar('Failed to save document: ' + (err as Error).message, 'error');
      console.error('Error saving document:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="home-page">
      <header className="page-header">
        <h1>Document Editor</h1>
        <p>Create and edit documents with professional formatting</p>
      </header>

      <div className="document-save-section" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <button
          onClick={saveDocument}
          disabled={isSaving}
          style={{
            backgroundColor: isSaving ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            fontSize: '16px',
            borderRadius: '4px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {isSaving ? (
            <>
              <span style={{
                display: 'inline-block',
                width: '16px',
                height: '16px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></span>
              Saving Document...
            </>
          ) : (
            'Save as Document with QR Code'
          )}
        </button>
      </div>

      <main className="editor-container">
        <WordLikeEditor
          ref={editorRef}
          initialTitle="Untitled Document"
        />
      </main>
    </div>
  );
};

const App: React.FC = () => {
  React.useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.classList.add('dark-mode');
    }
  }, []);

  return (
    <Router>
      <PageCacheProvider>
        <div className="App">
          <Navigation />
          <div className="app-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/ocr" element={<OCRPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/documents/:id" element={<DocumentEditorPage />} />
              <Route path="/documents/:id/access" element={<AccessManagementPage />} />
              <Route path="/documents/:documentId/audit" element={<AuditLogPage />} />
              <Route path="/documents/:documentId/versions" element={<VersionHistoryPage />} />
              <Route path="/collections" element={<CollectionsManagerPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/group-documents" element={<GroupDocumentsPage />} />
              <Route path="/share/:token" element={<ShareLinkPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
            </Routes>
          </div>
          <SnackbarContainer />
        </div>
      </PageCacheProvider>
    </Router>
  );
};

export default App;
