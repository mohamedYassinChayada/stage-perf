# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack document management system with a Django REST API backend and React TypeScript frontend. Features include document editing (Word-like TinyMCE editor), OCR processing (EasyOCR), version control, sharing, collections, labels, and audit logging.

## Development Commands

### Frontend (from `frontend/`)
```bash
npm run dev       # Start Vite dev server (http://localhost:5173)
npm run build     # TypeScript compile + Vite build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

### Backend (from `backend/my_project/`)
```bash
python manage.py runserver    # Start Django dev server (http://localhost:8000)
python manage.py migrate      # Apply database migrations
python manage.py makemigrations  # Create new migrations after model changes
python manage.py createsuperuser # Create admin user
```

### API Documentation
- Swagger UI: http://localhost:8000/swagger/

### Database
- PostgreSQL on localhost:5432, database: `docmanager`, user: `postgres`, password: `admin`

## Architecture

### Frontend (`frontend/src/`)
- **Entry**: `main.tsx` → `App.tsx` (routing)
- **Pages**: 13 pages in `pages/` (DocumentsPage, OCRPage, AuthPage, CollectionsManagerPage, etc.)
- **Components**: `WordLikeEditor.tsx` - custom multi-page Word-like editor using TinyMCE
- **Services**: `documentService.ts` (all API calls), `ocrService.ts` (OCR endpoints)
- **Utils**: `htmlToDocx.ts`, `pageBreakDetection.ts`
- **TinyMCE**: Self-hosted in `public/tinymce/`

### Backend (`backend/my_project/my_app/`)
- **Models** (`models.py`): Document, DocumentVersion, Label, Collection, Attachment, ACL, ShareLink, QRLink, AuditLog
- **Views** (`views.py`): REST endpoints for all operations
- **URLs** (`urls.py`): API routes under `/api/`
- **OCR** (`utils/ocr.py`): EasyOCR integration
- **QR** (`utils/qrcode_generator.py`): QR code generation

### Key API Endpoints
- `/api/documents/` - CRUD for documents
- `/api/ocr/extract/` - OCR text extraction
- `/api/auth/login/`, `/api/auth/register/`, `/api/auth/me/` - Authentication
- `/api/collections/`, `/api/labels/`, `/api/groups/` - Organization
- `/api/documents/{id}/share/` - Sharing
- `/api/search/standard/`, `/api/search/deep/` - Full-text search (PostgreSQL tsvector)

## Database Schema

Source of truth: `.cursor/rules/database-model.mdc` (PlantUML)

Key relationships:
- Document → DocumentVersion (1:many, version history)
- Document ↔ Label (many:many via DocumentLabel)
- Document ↔ Collection (many:many via DocumentCollection)
- Document → ACL (permissions: OWNER, EDITOR, VIEWER)
- Document → ShareLink (public share tokens)
- Document → AuditLog (action tracking)

## Tech Stack

**Frontend**: React 19, TypeScript, Vite, React Router DOM, TinyMCE, docx (export)
**Backend**: Django 5.2, Django REST Framework, PostgreSQL, EasyOCR, PyTorch, drf-yasg (Swagger)

## Test Accounts

user1/pass, user2/pass, user3/pass

## Project Documentation

- `.cursor/rules/project-plan.mdc` - Project requirements and patterns
- `.cursor/rules/database-model.mdc` - Database schema (PlantUML)
- `backend/my_project/EASYOCR_IMPLEMENTATION.md` - OCR setup details
- `backend/my_project/QR_CODE_IMPLEMENTATION_GUIDE.md` - QR code implementation
