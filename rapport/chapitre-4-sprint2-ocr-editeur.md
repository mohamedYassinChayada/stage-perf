# Chapitre IV : Sprint 2 -- OCR et Editeur Documentaire

## 1. Objectifs du sprint

Le deuxieme sprint porte sur le coeur fonctionnel du systeme de gestion documentaire. Il couvre les fonctionnalites suivantes :

- Integration du moteur OCR EasyOCR pour l'extraction de texte a partir d'images et de fichiers PDF.
- Developpement d'un editeur de documents riche multi-pages de type traitement de texte (base sur TinyMCE).
- Export des documents au format Word (.docx).
- Implementation du systeme de versionnement des documents.
- Mise en place de l'organisation par labels (etiquettes) et collections hierarchiques.

## 2. Backlog du sprint

| ID | Tache | Estimation | Statut |
|----|-------|-----------|--------|
| T2.1 | Integration du moteur EasyOCR avec preprocessing d'images | 8 | Termine |
| T2.2 | Endpoint d'extraction OCR basique | 3 | Termine |
| T2.3 | Endpoint d'extraction OCR detaillee (positions) | 5 | Termine |
| T2.4 | Extraction OCR depuis PDF (multi-pages) | 5 | Termine |
| T2.5 | Developpement de l'editeur WordLikeEditor (TinyMCE) | 13 | Termine |
| T2.6 | Gestion multi-pages avec sauts de page dynamiques | 8 | Termine |
| T2.7 | Export au format Word (.docx) | 5 | Termine |
| T2.8 | Implementation du modele DocumentVersion | 5 | Termine |
| T2.9 | Endpoints de versionnement et restauration | 5 | Termine |
| T2.10 | Modeles et endpoints pour labels et collections | 5 | Termine |
| T2.11 | Interface OCR frontend | 5 | Termine |
| T2.12 | Interface de gestion des labels et collections | 3 | Termine |

## 3. Specification des besoins

### a. Diagrammes de cas d'utilisation

```mermaid
graph TB
    subgraph "Sprint 2 : Cas d'utilisation"
        U((Utilisateur<br/>connecte))

        U --> UC1[Uploader une image/PDF<br/>pour extraction OCR]
        U --> UC2[Visualiser le texte extrait<br/>avec positions]
        U --> UC3[Inserer le texte OCR<br/>dans l'editeur]
        U --> UC4[Editer un document<br/>multi-pages]
        U --> UC5[Exporter un document<br/>au format Word]
        U --> UC6[Consulter l'historique<br/>des versions]
        U --> UC7[Restaurer une version<br/>anterieure]
        U --> UC8[Creer et attribuer<br/>des labels]
        U --> UC9[Organiser les documents<br/>dans des collections]
    end
```

*Figure 11 : Diagramme de cas d'utilisation -- Sprint 2*

**CU -- Uploader une image pour OCR :**
- *Acteur* : Utilisateur connecte
- *Precondition* : Fichier de type PNG, JPEG ou PDF, taille maximale 10 Mo
- *Scenario principal* : L'utilisateur selectionne un fichier. Le systeme effectue le preprocessing de l'image (redimensionnement, egalisation d'histogramme, flou gaussien), puis extrait le texte avec positionnement. Le resultat est affiche avec le taux de confiance.
- *Postcondition* : Le texte extrait est disponible pour insertion dans l'editeur.

**CU -- Editer un document multi-pages :**
- *Acteur* : Utilisateur connecte (OWNER ou EDITOR)
- *Scenario principal* : L'utilisateur ouvre un document dans l'editeur. L'editeur affiche le contenu en pages distinctes simulant un document Word. L'utilisateur modifie le contenu ; les sauts de page se recalculent dynamiquement.
- *Postcondition* : Le document est sauvegarde et une nouvelle version est creee.

### b. Diagrammes de sequences systeme

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant B as Backend Django
    participant OCR as EasyOCR Engine
    participant DB as PostgreSQL

    Note over U,DB: Scenario : Extraction OCR depuis une image

    U->>F: Selectionner fichier image
    F->>F: Valider type (PNG/JPEG/PDF)<br/>et taille (max 10 Mo)
    F->>B: POST /api/ocr/extract-detailed/<br/>(multipart/form-data)
    B->>B: Lire et decoder l'image
    B->>OCR: preprocess_image_for_ocr()
    Note right of OCR: Redimensionnement<br/>CLAHE<br/>Flou gaussien
    OCR-->>B: Image preprocessee
    B->>OCR: extract_text_with_positions()
    OCR->>OCR: readtext() avec EasyOCR
    OCR->>OCR: Grouper par lignes (coordonnee Y)
    OCR->>OCR: Trier par position X dans chaque ligne
    OCR-->>B: Texte + positions (bbox) + confiance
    B->>B: post_process_ocr_text()
    B-->>F: 200 {text, lines[], confidence, image_size}
    F->>F: formatOCRForTinyMCE()
    F-->>U: Afficher resultat structure
```

*Figure 12 : Diagramme de sequence -- Extraction OCR*

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant E as WordLikeEditor
    participant B as Backend Django
    participant DB as PostgreSQL

    Note over U,DB: Scenario : Edition et sauvegarde d'un document

    U->>F: Ouvrir un document existant
    F->>B: GET /api/documents/{id}/
    B->>DB: SELECT FROM my_app_document
    DB-->>B: Document (html, title, version_no)
    B-->>F: 200 {document}
    F->>E: setContent(html), setTitle(title)

    U->>E: Modifier le contenu
    E->>E: Detecter debordement de page
    E->>E: reflow() - redistribuer les blocs
    E->>E: Creer nouvelle page si necessaire

    U->>F: Cliquer sur "Sauvegarder"
    F->>E: getContent(), getTitle()
    E-->>F: HTML du document
    F->>B: PUT /api/documents/{id}/<br/>{title, html}
    B->>B: Comparer avec version actuelle
    B->>DB: INSERT INTO my_app_documentversion<br/>(version_no+1)
    B->>DB: UPDATE my_app_document<br/>SET html=..., current_version_no=...
    B->>DB: INSERT INTO my_app_auditlog<br/>(action=EDIT)
    B-->>F: 200 {document_updated}
    F-->>U: Confirmation de sauvegarde
```

*Figure 13 : Diagramme de sequence -- Edition et sauvegarde*

## 4. Conception

### a. Diagramme de classes

```mermaid
classDiagram
    class Document {
        +UUID id
        +string title
        +text html
        +text text
        +SearchVector search_tsv
        +User owner
        +int current_version_no
        +ImageField qr_code
        +datetime created_at
        +datetime updated_at
    }

    class DocumentVersion {
        +UUID id
        +Document document
        +int version_no
        +text html
        +text text
        +SearchVector search_tsv
        +User author
        +string change_note
        +string hash
        +datetime created_at
    }

    class Label {
        +UUID id
        +string name
    }

    class DocumentLabel {
        +int id
        +Document document
        +Label label
    }

    class Collection {
        +UUID id
        +string name
        +Collection parent
        +User owner
        +datetime created_at
    }

    class DocumentCollection {
        +int id
        +Document document
        +Collection collection
    }

    class Attachment {
        +UUID id
        +Document document
        +int version_no
        +string media_type
        +string filename
        +bytes data
        +JSON metadata
    }

    Document "1" --> "*" DocumentVersion : historique
    Document "*" --> "*" Label : etiquetes
    Document "*" --> "*" Collection : organisees
    Document "1" --> "*" Attachment : contient
    Collection "0..1" --> "*" Collection : sous-collections

    note for DocumentVersion "Contrainte unique:\n(document, version_no)"
    note for Collection "Structure hierarchique\nvia self-reference"
```

*Figure 14 : Diagramme de classes -- Sprint 2*

### b. Diagrammes de sequences detailles

```mermaid
sequenceDiagram
    participant F as Frontend
    participant OS as ocrService.ts
    participant V as views.py<br/>ocr_extract_detailed()
    participant OCR as utils/ocr.py
    participant EZ as EasyOCR Reader

    F->>OS: extractTextFromFile(file, useDetailed=true)
    OS->>OS: Valider type (PNG, JPEG, PDF)
    OS->>OS: Valider taille (max 10 Mo)
    OS->>V: POST /api/ocr/extract-detailed/

    V->>V: Lire fichier uploade
    V->>OCR: preprocess_image_for_ocr(image)
    OCR->>OCR: Convertir PIL Image en numpy array
    OCR->>OCR: Redimensionner si < 640x640
    OCR->>OCR: Appliquer CLAHE (egalisation adaptative)
    OCR->>OCR: Appliquer flou gaussien
    OCR-->>V: Image preprocessee (numpy)

    V->>OCR: extract_text_with_positions(image)
    OCR->>EZ: reader.readtext(image)
    EZ-->>OCR: Resultats bruts (bbox, text, confidence)
    OCR->>OCR: Filtrer par seuil de confiance (0.3)
    OCR->>OCR: Grouper en lignes par coordonnee Y
    OCR->>OCR: Trier chaque ligne par coordonnee X
    OCR-->>V: {lines: [{text, confidence, bbox}]}

    V->>OCR: post_process_ocr_text(text)
    OCR->>OCR: Normaliser espaces et sauts de ligne
    OCR->>OCR: Corriger erreurs OCR courantes
    OCR-->>V: Texte nettoye

    V-->>OS: 200 {text, lines, confidence, image_size}

    OS->>OS: formatOCRForTinyMCE(result)
    OS->>OS: Detecter en-tetes, listes, indentations
    OS->>OS: Construire HTML structure
    OS-->>F: {type: 'fragment', html: string}
```

*Figure 15 : Diagramme de sequence detaille -- Pipeline OCR complet*

```mermaid
sequenceDiagram
    participant F as Frontend
    participant WE as WordLikeEditor.tsx
    participant TM as TinyMCE Instance
    participant PB as pageBreakDetection.ts

    F->>WE: setContent(html)
    WE->>TM: editor.setContent(html)
    WE->>WE: reflow("setContent")

    loop Pour chaque bloc de contenu
        WE->>WE: Identifier blocs (P, DIV, H1-H6, TABLE...)
        WE->>WE: Mesurer hauteur du bloc
        alt Bloc depasse la page courante
            WE->>WE: Creer nouvelle div.word-page
            WE->>WE: Deplacer bloc vers nouvelle page
        else Bloc tient dans la page
            WE->>WE: Conserver dans page courante
        end
    end

    WE->>WE: Sauvegarder position du curseur
    WE->>TM: Mettre a jour le DOM
    WE->>WE: Restaurer position du curseur
    Note right of WE: Debounce: 80ms minimum<br/>entre deux reflows
```

*Figure 16 : Diagramme de sequence detaille -- Reflow de l'editeur multi-pages*

## 5. Realisation

### a. Environnement de travail

En complement de l'environnement decrit au Sprint 1, les technologies suivantes ont ete ajoutees :

**Technologies OCR :**

| Technologie | Version | Role |
|------------|---------|------|
| EasyOCR | 1.7.0+ | Moteur de reconnaissance optique de caracteres |
| PyTorch | 2.0.0+ | Framework de deep learning (utilise par EasyOCR) |
| OpenCV (cv2) | 4.8.0+ | Traitement et preprocessing d'images |
| Pillow (PIL) | 10.0.0+ | Manipulation d'images |
| NumPy | 1.26.0+ | Operations matricielles |
| pdf2image | 1.17.0+ | Conversion PDF vers images (utilise Poppler) |

**Technologies editeur :**

| Technologie | Version | Role |
|------------|---------|------|
| TinyMCE | Self-hosted | Editeur WYSIWYG riche |
| docx.js | 9.5.1 | Generation de fichiers Word (.docx) |
| file-saver | 2.0.5 | Telechargement de fichiers cote client |

### b. Interfaces realisees

**Page OCR (OCRPage.tsx)** : Cette page permet a l'utilisateur de telecharger un fichier image (PNG, JPEG) ou PDF pour en extraire le texte. L'interface affiche une zone de glisser-deposer pour le fichier, un indicateur de progression pendant le traitement, puis le resultat structure avec le taux de confiance global. L'utilisateur peut choisir d'inserer le texte extrait directement dans l'editeur de documents.

**Editeur de documents (WordLikeEditor.tsx)** : Le composant central de l'application est un editeur riche multi-pages construit autour de TinyMCE. Il simule l'experience d'un traitement de texte classique avec :
- Des pages distinctes separees visuellement (div.word-page).
- Un reflow automatique du contenu lorsque celui-ci depasse les limites d'une page.
- La detection et la gestion des elements de type bloc (paragraphes, titres H1-H6, tableaux, listes, images).
- La preservation de la position du curseur lors des reflows du DOM.
- Un debounce de 80 millisecondes pour eviter les reflows excessifs.

L'editeur expose une API via `React.forwardRef` comprenant les methodes : `getEditor()`, `getContent()`, `setContent()`, `getTitle()`, `setTitle()`, `insertContent()`, `focus()` et `reflow()`.

**Page de l'editeur de documents (DocumentEditorPage.tsx)** : Cette page integre le composant WordLikeEditor et fournit les boutons de sauvegarde et d'export. Elle charge le document existant via l'API et gere la sauvegarde avec creation automatique de version.

**Page d'historique des versions (VersionHistoryPage.tsx)** : Cette interface affiche la liste des versions d'un document avec le numero de version, l'auteur, la note de modification et la date. L'utilisateur peut consulter le contenu d'une version et restaurer une version anterieure.

**Page de gestion des collections (CollectionsManagerPage.tsx)** : Cette page permet de creer des collections (eventuellement hierarchiques en specifiant un parent), de supprimer des collections et d'assigner des documents a des collections.

## 6. Tests et validation

| Test | Description | Resultat |
|------|-------------|----------|
| T1 | Extraction OCR d'une image PNG contenant du texte | Texte extrait avec confiance > 80%. |
| T2 | Extraction OCR d'un fichier PDF multi-pages | Chaque page est traitee individuellement avec les positions. |
| T3 | Rejet d'un fichier depassant 10 Mo | Erreur 400 avec message explicite. |
| T4 | Rejet d'un format de fichier non supporte | Erreur de validation cote client. |
| T5 | Edition d'un document avec reflow multi-pages | Les pages se redistribuent correctement. |
| T6 | Sauvegarde et creation automatique de version | La version est incrementee et l'ancienne version est conservee. |
| T7 | Restauration d'une version anterieure | Le contenu est restaure et une nouvelle version est creee. |
| T8 | Export au format Word (.docx) | Le fichier genere s'ouvre correctement dans Microsoft Word. |
| T9 | Creation et attribution de labels | Les labels sont correctement associes au document. |
| T10 | Organisation en collections hierarchiques | Les collections parent-enfant fonctionnent correctement. |

## 7. Revue de sprint

**Livrables du Sprint 2 :**
- Pipeline OCR complet avec preprocessing d'images (CLAHE, flou gaussien, redimensionnement).
- Extraction OCR avec detection de positions (bounding boxes) et groupement intelligent en lignes.
- Support PDF multi-pages avec conversion page par page.
- Editeur multi-pages de type Word avec reflow dynamique et preservation du curseur.
- Export au format Word (.docx) via la bibliotheque docx.js.
- Systeme de versionnement complet avec historique et restauration.
- Organisation par labels et collections hierarchiques.

**Points positifs :**
- Le pipeline OCR produit des resultats de bonne qualite grace au preprocessing avance.
- L'editeur multi-pages offre une experience utilisateur proche d'un traitement de texte natif.
- Le systeme de versionnement assure la preservation de l'historique des modifications.

**Points d'amelioration :**
- Le support de langues supplementaires pour l'OCR (arabe, francais) pourrait etre ajoute.
- La performance du reflow pourrait etre optimisee pour les documents tres longs.
- L'ajout d'un mode collaboratif en temps reel constituerait une evolution interessante.
