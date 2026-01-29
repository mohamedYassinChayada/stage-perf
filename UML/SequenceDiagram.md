Sequence 1: Document Creation with QR Code & Version Snapshot

  sequenceDiagram
      actor U as User
      participant FE as React Frontend
      participant API as Django REST API
      participant DB as PostgreSQL
      participant QR as QR Generator

      U->>FE: Fill title & HTML content
      FE->>API: POST /api/documents/ (title, html, token)
      API->>API: Authenticate via Token
      API->>DB: INSERT Document (title, html, text, owner)
      DB-->>API: Document created (id=42)

      API->>DB: INSERT DocumentVersion (version_no=1, html, author)
      DB-->>API: Version snapshot saved

      API->>DB: INSERT AuditLog (action=EDIT, document=42)
      DB-->>API: Audit logged

      API->>DB: INSERT QRLink (code="doc-42-...", active=true)
      DB-->>API: QR link record created

      API->>QR: update_document_qr_code(document)
      QR->>QR: Generate PNG image
      QR-->>API: QR image saved to disk

      API->>DB: UPDATE Document (qr_code path)

      opt File attached
          API->>DB: INSERT Attachment (filename, data, media_type)
      end

      API-->>FE: 201 Created (document JSON + qr_code_url)
      FE-->>U: Display new document with QR code

  Sequence 2: OCR Text Extraction from PDF

  sequenceDiagram
      actor U as User
      participant FE as React Frontend
      participant API as Django REST API
      participant OCR as EasyOCR Engine
      participant CV as OpenCV
      participant PDF as pdf2image

      U->>FE: Upload PDF file
      FE->>API: POST /api/ocr/extract-detailed/ (multipart file)

      API->>API: Validate file (size ≤ 10MB, extension)
      API->>API: Detect file_type = "pdf"

      API->>PDF: Convert PDF pages to images
      PDF-->>API: List of page images

      loop Each page image
          API->>CV: Preprocess image (grayscale, threshold)
          CV-->>API: Enhanced image array
          API->>OCR: reader.readtext(image)
          OCR-->>API: [(bbox, text, confidence), ...]
      end

      API->>API: Merge results: lines, blocks, positions
      API->>API: Calculate overall confidence score

      API-->>FE: 200 OK {text, lines[], blocks[], image_size, confidence, pdf_pages, processing_time}
      FE-->>U: Display extracted text with positioning overlays

  Sequence 3: Share Document via Link + Anonymous Access

  sequenceDiagram
      actor Owner as Document Owner
      actor Viewer as Anonymous Viewer
      participant FE as React Frontend
      participant API as Django REST API
      participant DB as PostgreSQL

      Note over Owner,DB: Phase 1 - Owner creates share link

      Owner->>FE: Click "Share" on document #42
      FE->>API: POST /api/documents/42/share-links/ {role: "VIEWER", expires_at: "2026-03-01"}
      API->>API: Check permission (user_can_perform_action SHARE)
      API->>DB: INSERT ShareLink (token=uuid, role=VIEWER, expires_at, document=42)
      DB-->>API: ShareLink created
      API->>DB: INSERT ACL (subject_type=share_link, subject_id, role=VIEWER)
      DB-->>API: ACL entry created
      API-->>FE: 201 {id, token: "abc-123-...", role, expires_at}
      FE-->>Owner: Display shareable URL: /share-links/abc-123-.../

      Note over Viewer,DB: Phase 2 - Anonymous user accesses the link

      Viewer->>FE: Open shared URL
      FE->>API: GET /api/share-links/abc-123-.../
      API->>DB: SELECT ShareLink WHERE token="abc-123-..." AND revoked_at IS NULL
      DB-->>API: ShareLink found

      alt Link expired
          API-->>FE: 404 "Share link has expired"
          FE-->>Viewer: Show "Link expired" message
      else Link valid
          API->>DB: SELECT Document WHERE id=42
          DB-->>API: Document data
          API-->>FE: 200 {document: {...}, access_role: "VIEWER"}
          FE-->>Viewer: Display read-only document
      end

      Note over Owner,DB: Phase 3 - Owner revokes the link

      Owner->>FE: Click "Revoke" on share link
      FE->>API: DELETE /api/share-links/{share_link_id}/revoke/
      API->>DB: UPDATE ShareLink SET revoked_at=now()
      API->>DB: DELETE ACL WHERE subject_type=share_link AND subject_id=...
      API-->>FE: 204 No Content

  Sequence 4: Version Restore with Audit Trail

  sequenceDiagram
      actor U as User
      participant FE as React Frontend
      participant API as Django REST API
      participant DB as PostgreSQL

      U->>FE: Open document #42, click "Version History"
      FE->>API: GET /api/documents/42/versions/ (Token auth)

      API->>API: Authenticate & check DocumentAccessPermission
      API->>DB: SELECT DocumentVersion WHERE document=42 ORDER BY version_no DESC
      DB-->>API: [v5, v4, v3, v2, v1]
      API->>DB: INSERT AuditLog (action=VIEW, context={version_history_accessed})
      API-->>FE: 200 [{version_no:5, author, created_at, change_note}, ...]
      FE-->>U: Show version timeline

      U->>FE: Click "View" on version 3
      FE->>API: GET /api/documents/42/versions/{v3-uuid}/
      API->>DB: SELECT DocumentVersion WHERE id=v3-uuid AND document=42
      DB-->>API: Version 3 (html, text, change_note)
      API->>DB: INSERT AuditLog (action=VIEW, version_no=3)
      API-->>FE: 200 {html, text, version_no:3, change_note, author}
      FE-->>U: Show side-by-side diff (current vs v3)

      U->>FE: Click "Restore this version"
      FE->>API: POST /api/documents/42/restore/ {version_id: v3-uuid, change_note: "Reverting bad edits"}

      API->>API: Check EDIT permission (user_can_perform_action)
      API->>DB: SELECT DocumentVersion WHERE id=v3-uuid
      DB-->>API: Version 3 content

      API->>DB: INSERT DocumentVersion (version_no=6, html=v3.html, text=v3.text, change_note="Reverting... (restored
  from v3)")
      DB-->>API: Version 6 created

      API->>DB: UPDATE Document SET html=v3.html, text=v3.text, current_version_no=6
      DB-->>API: Document updated

      API->>DB: INSERT AuditLog (action=EDIT, version_no=6, context={action:version_restore, restored_from:3})
      DB-->>API: Audit logged

      API-->>FE: 200 (updated document JSON, current_version_no=6)
      FE-->>U: Document restored, editor shows v3 content, version badge shows "v6"
