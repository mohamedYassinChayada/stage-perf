# Diagrammes de Sequence -- Version Mise a Jour

Ce fichier contient les diagrammes de sequence mis a jour pour refleter les changements recents du projet.

## Sequence 1 : Creation de document avec QR Code (Mise a jour)

> **Changement** : Le QR code est maintenant stocke en tant que donnees binaires dans la base de donnees PostgreSQL (champ `qr_code_data` de type `BinaryField`) au lieu d'un fichier image sur le disque.

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as Frontend React
    participant API as Backend Django
    participant DB as PostgreSQL
    participant QR as QR Generator

    U->>FE: Saisir titre et contenu HTML
    FE->>API: POST /api/documents/ (title, html, token)
    API->>API: Authentifier via Token
    API->>DB: INSERT Document (title, html, text, owner)
    DB-->>API: Document cree (id=42)

    API->>DB: INSERT DocumentVersion (version_no=1, html, author)
    DB-->>API: Version snapshot sauvegardee

    API->>DB: INSERT AuditLog (action=EDIT, document=42)
    DB-->>API: Audit journalise

    API->>DB: INSERT QRLink (code="doc-42-...", active=true)
    DB-->>API: Enregistrement QRLink cree

    API->>QR: generate_document_qr_code(document)
    QR->>QR: Construire URL: base_url + /api/qr/resolve/{code}/
    QR->>QR: qrcode.make(url, box_size=10, border=4)
    QR->>QR: Redimensionner a 300x300 pixels
    QR->>QR: Sauvegarder PNG dans BytesIO
    QR-->>API: ContentFile (donnees binaires PNG)

    API->>DB: UPDATE Document SET qr_code_data = bytes
    Note right of DB: Stockage binaire en base<br/>de donnees (Neon Cloud DB)<br/>au lieu de fichier sur disque

    opt Fichier attache
        API->>DB: INSERT Attachment (filename, data, media_type)
    end

    opt Document cree depuis OCR (is_ocr=true)
        API->>DB: SELECT ou INSERT Label (name="OCR")
        DB-->>API: Label OCR
        API->>DB: INSERT DocumentLabel (document, label=OCR)
        API->>DB: UPDATE Attachment SET metadata={is_ocr_source: true}
    end

    API-->>FE: 201 Created (document JSON + qr_code_url)
    FE-->>U: Afficher nouveau document avec QR code
```

## Sequence 2 : Extraction OCR depuis PDF (Inchange)

> Aucune modification -- le pipeline OCR reste identique.

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as Frontend React
    participant API as Backend Django
    participant OCR as EasyOCR Engine
    participant CV as OpenCV
    participant PDF as pdf2image

    U->>FE: Uploader fichier PDF
    FE->>API: POST /api/ocr/extract-detailed/ (multipart file)

    API->>API: Valider fichier (taille <= 10MB, extension)
    API->>API: Detecter file_type = "pdf"

    API->>PDF: Convertir pages PDF en images
    PDF-->>API: Liste d'images par page

    loop Chaque image de page
        API->>CV: Preprocesser image (niveaux de gris, seuil)
        CV-->>API: Tableau image ameliore
        API->>OCR: reader.readtext(image)
        OCR-->>API: [(bbox, texte, confiance), ...]
    end

    API->>API: Fusionner resultats : lignes, blocs, positions
    API->>API: Calculer score de confiance global

    API-->>FE: 200 OK {text, lines[], blocks[], image_size, confidence, pdf_pages, processing_time}
    FE-->>U: Afficher texte extrait avec superposition des positions
```

## Sequence 3 : Partage de document via lien (Inchange)

> Aucune modification majeure.

```mermaid
sequenceDiagram
    actor Owner as Proprietaire
    actor Viewer as Visiteur Anonyme
    participant FE as Frontend React
    participant API as Backend Django
    participant DB as PostgreSQL

    Note over Owner,DB: Phase 1 -- Le proprietaire cree un lien de partage

    Owner->>FE: Cliquer "Partager" sur document #42
    FE->>API: POST /api/documents/42/share-links/ {role: "VIEWER", expires_at: "2026-03-01"}
    API->>API: Verifier permission (SHARE)
    API->>DB: INSERT ShareLink (token=uuid, role=VIEWER, expires_at, document=42)
    DB-->>API: ShareLink cree
    API->>DB: INSERT ACL (subject_type=share_link, subject_id, role=VIEWER)
    DB-->>API: Entree ACL creee
    API-->>FE: 201 {id, token: "abc-123-...", role, expires_at}
    FE-->>Owner: Afficher URL de partage : /share-links/abc-123-.../

    Note over Viewer,DB: Phase 2 -- Un visiteur anonyme accede au lien

    Viewer->>FE: Ouvrir URL partagee
    FE->>API: GET /api/share-links/abc-123-.../
    API->>DB: SELECT ShareLink WHERE token="abc-123-..." AND revoked_at IS NULL
    DB-->>API: ShareLink trouve

    alt Lien expire
        API-->>FE: 404 "Le lien de partage a expire"
        FE-->>Viewer: Afficher message "Lien expire"
    else Lien valide
        API->>DB: SELECT Document WHERE id=42
        DB-->>API: Donnees du document
        API-->>FE: 200 {document: {...}, access_role: "VIEWER"}
        FE-->>Viewer: Afficher document en lecture seule
    end

    Note over Owner,DB: Phase 3 -- Le proprietaire revoque le lien

    Owner->>FE: Cliquer "Revoquer" sur le lien de partage
    FE->>API: DELETE /api/share-links/{share_link_id}/revoke/
    API->>DB: UPDATE ShareLink SET revoked_at=now()
    API->>DB: DELETE ACL WHERE subject_type=share_link AND subject_id=...
    API-->>FE: 204 No Content
```

## Sequence 4 : Restauration de version (Inchange)

> Aucune modification.

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as Frontend React
    participant API as Backend Django
    participant DB as PostgreSQL

    U->>FE: Ouvrir document #42, cliquer "Historique des versions"
    FE->>API: GET /api/documents/42/versions/ (Token auth)

    API->>API: Authentifier et verifier DocumentAccessPermission
    API->>DB: SELECT DocumentVersion WHERE document=42 ORDER BY version_no DESC
    DB-->>API: [v5, v4, v3, v2, v1]
    API->>DB: INSERT AuditLog (action=VIEW, context={version_history_accessed})
    API-->>FE: 200 [{version_no:5, author, created_at, change_note}, ...]
    FE-->>U: Afficher timeline des versions

    U->>FE: Cliquer "Voir" sur version 3
    FE->>API: GET /api/documents/42/versions/{v3-uuid}/
    API->>DB: SELECT DocumentVersion WHERE id=v3-uuid AND document=42
    DB-->>API: Version 3 (html, text, change_note)
    API->>DB: INSERT AuditLog (action=VIEW, version_no=3)
    API-->>FE: 200 {html, text, version_no:3, change_note, author}
    FE-->>U: Afficher comparaison (actuel vs v3)

    U->>FE: Cliquer "Restaurer cette version"
    FE->>API: POST /api/documents/42/restore/ {version_id: v3-uuid, change_note: "Retour version precedente"}

    API->>API: Verifier permission EDIT
    API->>DB: SELECT DocumentVersion WHERE id=v3-uuid
    DB-->>API: Contenu de la version 3

    API->>DB: INSERT DocumentVersion (version_no=6, html=v3.html, text=v3.text, change_note="Restaure depuis v3")
    DB-->>API: Version 6 creee

    API->>DB: UPDATE Document SET html=v3.html, text=v3.text, current_version_no=6
    DB-->>API: Document mis a jour

    API->>DB: INSERT AuditLog (action=EDIT, version_no=6, context={action:version_restore, restored_from:3})
    DB-->>API: Audit journalise

    API-->>FE: 200 (document JSON mis a jour, current_version_no=6)
    FE-->>U: Document restaure, editeur affiche contenu v3, badge version "v6"
```

## Sequence 5 : Event Polling en temps reel (Nouveau)

> **Nouveau diagramme** : Mecanisme de polling pour les mises a jour en temps reel des documents.

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as Frontend React
    participant ES as eventService.ts<br/>DocumentEventService
    participant API as Backend Django
    participant DB as PostgreSQL

    U->>FE: Ouvrir un document
    FE->>ES: start(documentId)
    ES->>ES: Initialiser lastCheckTime = now()
    ES->>ES: pollIntervalMs = 5000ms

    loop Polling periodique (toutes les 5s)
        ES->>API: GET /api/documents/{id}/events/poll/<br/>?since={lastCheckTime}
        API->>DB: SELECT AuditLog WHERE document_id<br/>AND ts > since
        DB-->>API: Evenements recents

        alt Nouveaux evenements detectes
            API-->>ES: 200 {events: [...], server_time, has_more: false}
            ES->>ES: lastCheckTime = server_time
            ES->>ES: consecutiveEmptyPolls = 0
            ES->>FE: Notifier callbacks avec evenements
            FE-->>U: Afficher notification (Snackbar)
        else Aucun evenement
            API-->>ES: 200 {events: [], server_time, has_more: false}
            ES->>ES: consecutiveEmptyPolls++
            alt consecutiveEmptyPolls > 5
                ES->>ES: Augmenter intervalle<br/>(+2s, max 30s)
            end
        end
    end

    Note over ES,API: Gestion de la visibilite de la page

    U->>FE: Changer d'onglet (page cachee)
    FE->>ES: visibilitychange event
    ES->>ES: isPaused = true<br/>Arreter le timer

    U->>FE: Revenir a l'onglet
    FE->>ES: visibilitychange event
    ES->>ES: isPaused = false
    ES->>ES: Reprendre le polling immediatement

    Note over ES,API: Detection de revocation d'acces

    ES->>API: GET /api/documents/{id}/events/poll/
    API-->>ES: 403 Forbidden
    ES->>FE: Emettre evenement ACCESS_REVOKED
    ES->>ES: stop() -- arreter le polling
    FE-->>U: Afficher message "Acces revoque"
```

## Sequence 6 : Creation de document depuis OCR (Nouveau)

> **Nouveau diagramme** : Flux complet de creation d'un document a partir d'un fichier scanne via OCR, avec stockage du fichier original et attribution automatique du label "OCR".

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as Frontend React<br/>(OCRPage)
    participant API as Backend Django
    participant OCR as EasyOCR Engine
    participant DB as PostgreSQL

    U->>FE: Uploader image/PDF sur la page OCR
    FE->>API: POST /api/ocr/extract-detailed/ (multipart file)
    API->>OCR: Extraction de texte (EasyOCR)
    OCR-->>API: Resultats OCR (text, lines, blocks, confidence)
    API-->>FE: 200 OK {text, lines[], blocks[], confidence}
    FE-->>U: Afficher texte extrait avec apercu

    U->>FE: Cliquer "Enregistrer comme document"
    FE->>FE: Construire FormData (title, file, html, is_ocr=true)
    FE->>API: POST /api/documents/ (FormData + Token)

    API->>API: Authentifier via Token
    API->>DB: INSERT Document (title, html, text, owner)
    DB-->>API: Document cree (id=N)

    API->>DB: INSERT DocumentVersion (version_no=1)
    API->>DB: INSERT AuditLog (action=EDIT)
    API->>DB: INSERT QRLink (code, active=true)
    API->>DB: UPDATE Document SET qr_code_data = bytes

    Note over API,DB: Stockage du fichier original
    API->>DB: INSERT Attachment (filename, data, media_type, metadata={})
    DB-->>API: Attachment cree

    Note over API,DB: Attribution automatique du label OCR
    API->>DB: SELECT ou INSERT Label (name="OCR")
    DB-->>API: Label OCR (get_or_create)
    API->>DB: INSERT DocumentLabel (document=N, label=OCR)
    API->>DB: UPDATE Attachment SET metadata={is_ocr_source: true}

    API-->>FE: 201 Created (document JSON avec file_url)
    FE-->>U: Rediriger vers editeur du document

    Note over U,DB: Acces ulterieur au fichier original
    U->>FE: Cliquer "Voir Original" sur la carte du document
    FE->>API: GET /api/attachments/{id}/download/
    API->>DB: SELECT Attachment WHERE id=...
    DB-->>API: Donnees binaires du fichier
    API-->>FE: Reponse fichier (Content-Disposition)
    FE-->>U: Telecharger/afficher le fichier original
```
