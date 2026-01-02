---
applyTo: '**'
---

# Document Management System -  AI Rules

## Project Overview
This is a full-stack document management system built with:
- **Frontend**: React with TinyMCE editor self hosted
- **Backend**: Django REST Framework
- **Database**: PostgreSQL with full-text search
- **OCR**: EasyOCR for text extraction
- **Authentication**: Django built-in auth system

## Core Features & Requirements

### OCR & Document Capture
- Scan paper documents and extract text from images using EasyOCR
- Side-by-side review interface (image left, extracted text right)
- Allow manual corrections to OCR results
- Batch or single image processing with confidence scores
- Store original images as attachments in database

### Document Authoring
- TinyMCE editor configured for multi-page layout like Microsoft Word
- Page size/margin guides, headers/footers, page breaks
- Create documents from scratch or from OCR text
- Store HTML as source of truth in PostgreSQL
- Auto-generate plain text from HTML using BeautifulSoup for search indexing
- QR code watermark overlay in editor preview

### QR Code System
- Auto-generate unique QR code for every document on save
- Store QR code in document table (qr_code field)
- Permission-aware QR scanning with auth checks
- QR resolver endpoint that validates access before opening document
- Ability to download/display QR code when viewing document
- Guaranteed QR watermark on PDF exports

### Search Functionality
- **Standard Search**: Search by document title and labels/tags
- **Deep Search**: Full-text search within document content
- PostgreSQL tsvector/GIN index for efficient text search
- Respect user permissions - only search accessible documents
- Search filters: labels, date ranges, owner, status
- Return ranked results with snippet highlights

### Organization Features
- Labels/tags system for document categorization
- Collections/folders with hierarchical structure
- Document relationships (revision-of, related-to, references)
- Bulk operations for organizing documents

### User Management & Permissions
- Role-based access control: Admin, Owner, Editor, Viewer
- Document sharing to individual users or groups
- Shareable public links with role scopes and expiry dates
- Admin panel for user and access management

### Version Control
- Track document changes like Google Docs
- Store complete version history with HTML content
- Author tracking and change notes for each version
- Ability to revert to previous versions via React interface

### Security Notes (Minimal Security Approach)
- DO NOT implement virus scanning
- DO NOT sanitize HTML content extensively
- DO NOT add unnecessary CSRF/CORS configurations
- Focus only on role-based permissions and basic auth

## Database Schema Guidelines

### Core Tables Structure:
```
documents: id(uuid), title, html, text, qr_code(unique), owner_id, created_at, updated_at
document_versions: id, document_id, version_no, html, text, author_id, change_note, created_at
tags: id, name(unique), color
document_tags: document_id, tag_id (many-to-many)
document_shares: id, document_id, user_id, share_token, role, expires_at, is_active
collections: id, name, parent_id, owner_id, created_at
audit_logs: id, document_id, user_id, action, ip_address, timestamp
attachments: id, document_id, file_type, file_path, ocr_confidence
```

### Database Indexes:
- GIN index on tsvector for full-text search
- Indexes on frequently queried fields (owner_id, status, updated_at)
- Unique constraints on QR codes and share tokens

## Django Backend Patterns

### Models:
- Use UUID primary keys for all models
- Implement proper foreign key relationships
- Add model methods for common operations (generate_qr_code, extract_text)
- Use PostgreSQL-specific fields (tsvector for search)

### Views & APIs:
- Class-based views with proper permission mixins
- Implement custom permission classes for document access
- OCR processing endpoints with file upload handling
- QR resolver endpoint with permission validation
- Search endpoints with pagination and filtering

### Serializers:
- Handle HTML to plain text conversion using BeautifulSoup
- Nested serializers for related data (tags, versions, shares)
- Custom validation for sharing permissions
- File upload serializers for OCR images

## React Frontend Patterns

### Component Structure:
```
src/
  components/
    Editor/         # TinyMCE wrapper components
    OCR/           # Image upload and text extraction
    Search/        # Search interface and results
    Documents/     # Document list and management
    QRScanner/     # QR code scanning functionality
    Sharing/       # Permission and sharing management
```

### TinyMCE Configuration:
- Multi-page plugin for Word-like experience make TinyMCE Page Break plugin is used 
- Custom toolbar with document-specific tools
- QR watermark plugin integration
- Auto-save functionality with conflict detection
- Print/PDF export with guaranteed QR watermarks

### State Management:
- Use React Context for global state (user auth, current document)
- Local component state with useState for form data
- Custom hooks for API calls and data fetching
- Error handling and loading states

### Key React Components:
- OCRReviewComponent: Side-by-side image and text review
- MultiPageEditor: TinyMCE with Word-like pagination
- QRScannerModal: Camera-based QR code scanning & QR picture upload and scan
- SearchInterface: Standard and deep search with filters
- DocumentShareModal: Manage permissions and sharing
- VersionHistoryPanel: Show and revert document versions

## API Endpoint Patterns

### Document Operations:
```
GET    /api/documents/                 # List accessible documents
POST   /api/documents/                 # Create new document
GET    /api/documents/{id}/            # Get document details
PUT    /api/documents/{id}/            # Update document
DELETE /api/documents/{id}/            # Delete document
GET    /api/documents/{id}/versions/   # Get version history
POST   /api/documents/{id}/revert/     # Revert to version
```

### OCR & File Processing:
```
POST   /api/ocr/upload/               # Upload image for OCR
GET    /api/ocr/status/{job_id}/      # Check OCR processing status
POST   /api/ocr/review/               # Submit reviewed OCR text
```

### Search & Discovery:
```
GET    /api/search/                   # Standard search
GET    /api/search/deep/              # Full-text search
GET    /api/qr/resolve/{code}/        # Resolve QR code to document
```

### Sharing & Permissions:
```
POST   /api/documents/{id}/share/     # Share document
GET    /api/documents/{id}/shares/    # List document shares
DELETE /api/shares/{share_id}/        # Revoke share
GET    /api/documents/shared/         # Documents shared with user
```

## Key Workflows Implementation

### OCR Workflow:
1. User uploads image via React component
2. Django processes with EasyOCR, returns confidence scores
3. Side-by-side review interface in React
4. User makes corrections and saves as new document
5. Store original image as attachment, text as HTML

### QR Scanning Workflow:
1. React QR scanner captures code
2. Send to /api/qr/resolve/{code}/ endpoint
3. Django checks user permissions for document
4. Return document ID if authorized, error if not
5. React navigates to document page

### Search Workflow:
1. React search component sends query with filters
2. Django performs tsvector search with permission filtering
3. Return ranked results with highlighted snippets
4. React displays results with filtering options

### Document Sharing:
1. Document owner opens sharing modal in React
2. Select users/groups and assign roles
3. Generate shareable link with expiry if needed
4. Django creates share records and sends notifications
5. Audit log tracks sharing activity

## Performance Considerations

### Database Optimization:
- Use select_related/prefetch_related for reducing queries
- Implement proper indexing strategy
- Consider database connection pooling
- Use database-level triggers for tsvector updates

### Frontend Optimization:
- Lazy load TinyMCE and heavy components
- Implement virtual scrolling for large document lists
- Use React.memo for expensive re-renders
- Cache search results and document metadata

### File Storage:
- Store attachments 
- Implement proper file cleanup for deleted documents

## Testing Guidelines

### Django Testing:
- Unit tests for models and utility functions
- API endpoint integration tests
- Permission system testing (critical)
- OCR processing pipeline tests

### React Testing:
- Component testing with React Testing Library
- Mock API calls for isolated component tests
- E2E tests for critical workflows (OCR, sharing, search)
- Accessibility testing for editor components

## Development Best Practices

### Code Organization:
- Keep Django apps focused (documents, users, ocr, search)
- Use Django REST framework conventions
- Implement proper error handling and logging
- Follow React hooks patterns and avoid class components

### Security & Permissions:
- Always check document access in API views
- Implement proper RBAC throughout the system
- Log security-relevant actions in audit trail
- Validate file uploads (size, type) but don't over-sanitize

### Documentation:
- Document API endpoints with proper schemas
- Comment complex business logic
- Maintain migration notes for database changes
- Keep component prop interfaces well-defined

### API Documentation with Swagger
-make sure to put all the necessary endpoint in Swagger for testing