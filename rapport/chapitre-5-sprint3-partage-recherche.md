# Chapitre V : Sprint 3 -- Partage Securise et Recherche

## 1. Objectifs du sprint

Le troisieme sprint finalise le systeme de gestion documentaire en ajoutant les fonctionnalites de partage et de recherche :

- Generation de QR codes associes aux documents pour un acces rapide.
- Creation de liens de partage (ShareLink) avec tokens securises et roles configurables.
- Implementation de la recherche standard par titre avec filtrage par labels.
- Implementation de la recherche plein texte (deep search) exploitant les capacites PostgreSQL tsvector.
- Developpement de l'interface de recherche avancee.

## 2. Backlog du sprint

| ID | Tache | Estimation | Statut |
|----|-------|-----------|--------|
| T3.1 | Implementation du generateur de QR codes | 5 | Termine |
| T3.2 | Endpoint de resolution de QR codes | 3 | Termine |
| T3.3 | Modele QRLink et gestion d'expiration | 3 | Termine |
| T3.4 | Modele ShareLink et generation de tokens | 5 | Termine |
| T3.5 | Endpoints de partage par lien | 5 | Termine |
| T3.6 | Recherche standard par titre avec filtrage | 3 | Termine |
| T3.7 | Recherche plein texte avec PostgreSQL tsvector | 8 | Termine |
| T3.8 | Filtrage des resultats par permissions | 5 | Termine |
| T3.9 | Interface de partage et QR codes (frontend) | 5 | Termine |
| T3.10 | Interface de recherche avancee (frontend) | 3 | Termine |
| T3.11 | Tests et validation | 3 | Termine |

## 3. Specification des besoins

### a. Diagrammes de cas d'utilisation

```mermaid
graph TB
    subgraph "Sprint 3 : Cas d'utilisation"
        U((Utilisateur<br/>connecte))
        V((Visiteur<br/>anonyme))

        U --> UC1[Generer un QR code<br/>pour un document]
        U --> UC2[Creer un lien de partage<br/>avec role et expiration]
        U --> UC3[Revoquer un lien<br/>de partage]
        U --> UC4[Rechercher par titre<br/>et labels]
        U --> UC5[Rechercher dans le contenu<br/>plein texte]
        U --> UC6[Scanner un QR code<br/>pour acceder a un document]

        V --> UC7[Acceder a un document<br/>via lien de partage]
        V --> UC8[Acceder a un document<br/>via QR code]
    end
```

*Figure 17 : Diagramme de cas d'utilisation -- Sprint 3*

**CU -- Creer un lien de partage :**
- *Acteur* : Utilisateur connecte (Proprietaire)
- *Precondition* : L'utilisateur est proprietaire du document
- *Scenario principal* : Le proprietaire selectionne un document, choisit le role a accorder (VIEWER ou EDITOR), et optionnellement definit une date d'expiration. Le systeme genere un token unique et retourne l'URL de partage.
- *Postcondition* : Le ShareLink est cree et l'action est journalisee dans l'audit.

**CU -- Recherche plein texte :**
- *Acteur* : Utilisateur connecte
- *Scenario principal* : L'utilisateur saisit une requete de recherche. Le systeme interroge l'index tsvector de PostgreSQL pour trouver les documents dont le contenu correspond a la requete, filtre les resultats selon les permissions de l'utilisateur, et retourne les documents accessibles.
- *Postcondition* : Les resultats sont affiches, limites aux documents autorises.

### b. Diagrammes de sequences systeme

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant B as Backend Django
    participant QR as QR Code Generator
    participant DB as PostgreSQL

    Note over U,DB: Scenario : Generation d'un QR code

    U->>F: Demander QR code pour un document
    F->>B: POST /api/documents/ (creation)<br/>ou GET /api/documents/{id}/qrcode/
    B->>DB: INSERT INTO my_app_qrlink<br/>(code, document, active=True)
    B->>QR: generate_document_qr_code(document)
    QR->>QR: Encoder URL: /api/qr/resolve/{code}/
    QR->>QR: Generer image QR (300x300, border=4)
    QR-->>B: ContentFile (image PNG)
    B->>DB: UPDATE my_app_document<br/>SET qr_code=image
    B-->>F: 200 {qr_code_url, qr_resolve_url}
    F-->>U: Afficher QR code telecharger
```

*Figure 18 : Diagramme de sequence -- Generation de QR code*

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant B as Backend Django
    participant DB as PostgreSQL

    Note over U,DB: Scenario : Recherche plein texte (deep search)

    U->>F: Saisir requete de recherche
    F->>B: GET /api/search/deep/?q=requete
    B->>B: Construire SearchQuery('requete', config='english')
    B->>DB: SELECT FROM my_app_document<br/>WHERE search_tsv @@ query
    DB-->>B: Documents correspondants
    B->>B: _permission_filter_queryset(user, results)
    Note right of B: Filtrer par:<br/>1. Admin → tous<br/>2. Owner → inclus<br/>3. ACL user (non expire)<br/>4. ACL groupe (non expire)
    B-->>F: 200 {results: documents[]}
    F-->>U: Afficher resultats filtres
```

*Figure 19 : Diagramme de sequence -- Recherche plein texte*

```mermaid
sequenceDiagram
    actor P as Proprietaire
    participant F as Frontend React
    participant B as Backend Django
    participant DB as PostgreSQL

    Note over P,DB: Scenario : Creation d'un lien de partage

    P->>F: Selectionner document et role
    F->>B: POST /api/documents/{id}/share-links/<br/>{role: "VIEWER"}
    B->>B: Verifier permission OWNER
    B->>B: Generer token unique (UUID)
    B->>DB: INSERT INTO my_app_sharelink<br/>(token, document, role, created_by)
    B->>DB: INSERT INTO my_app_auditlog<br/>(action=SHARE)
    B-->>F: 201 {id, token, role, url}
    F-->>P: Afficher lien de partage copiable

    Note over P,DB: Acces via lien de partage

    actor V as Visiteur
    V->>F: Ouvrir /api/share-links/{token}/
    F->>B: GET /api/share-links/{token}/
    B->>DB: SELECT FROM my_app_sharelink<br/>WHERE token=...
    B->>B: Verifier non revoque et non expire
    B->>DB: SELECT FROM my_app_document
    B->>DB: INSERT INTO my_app_auditlog<br/>(action=VIEW, share_link=...)
    B-->>F: 200 {document, role}
    F-->>V: Afficher document (lecture seule ou edition)
```

*Figure 20 : Diagramme de sequence -- Lien de partage*

## 4. Conception

### a. Diagramme de classes

```mermaid
classDiagram
    class Document {
        +UUID id
        +string title
        +text html
        +SearchVector search_tsv
        +User owner
        +ImageField qr_code
    }

    class ShareLink {
        +UUID id
        +Document document
        +string role
        +string token
        +datetime expires_at
        +datetime revoked_at
        +User created_by
        +datetime created_at
        +isValid() bool
    }

    class QRLink {
        +UUID id
        +Document document
        +int version_no
        +string code
        +string sig
        +datetime expires_at
        +bool active
        +User created_by
        +datetime created_at
    }

    class AuditLog {
        +UUID id
        +User actor_user
        +string action
        +Document document
        +ShareLink share_link
        +QRLink qr_link
        +string ip
        +string user_agent
        +JSON context
    }

    Document "1" --> "*" ShareLink : partage via
    Document "1" --> "*" QRLink : accessible via
    Document "1" --> "*" AuditLog : journalise
    ShareLink "0..1" --> "*" AuditLog : reference
    QRLink "0..1" --> "*" AuditLog : reference

    note for ShareLink "token: UUID unique\nrole: VIEWER | EDITOR\nrevoked_at: null si actif"
    note for QRLink "code: 'doc-{id}-{timestamp}'\nactive: un seul QR actif par document"
```

*Figure 21 : Diagramme de classes -- Sprint 3*

### b. Diagrammes de sequences detailles

```mermaid
sequenceDiagram
    participant F as Frontend
    participant V as views.py<br/>deep_search()
    participant P as permissions.py
    participant DB as PostgreSQL

    F->>V: GET /api/search/deep/?q=texte
    V->>V: Extraire parametre q

    alt PostgreSQL avec tsvector disponible
        V->>DB: SELECT * FROM my_app_document<br/>WHERE search_tsv @@ to_tsquery('english', 'texte')
    else Fallback
        V->>DB: SELECT * FROM my_app_document<br/>WHERE text ILIKE '%texte%'
    end

    DB-->>V: Resultats bruts (tous documents)

    V->>P: _permission_filter_queryset(user, queryset)
    P->>P: Verifier is_staff ou is_superuser
    alt Administrateur
        P-->>V: Tous les resultats
    else Utilisateur normal
        P->>DB: SELECT id FROM my_app_document<br/>WHERE owner_id = user.id
        P->>DB: SELECT document_id FROM my_app_acl<br/>WHERE subject_type='user'<br/>AND subject_id=user.id<br/>AND (expires_at IS NULL OR expires_at > NOW())
        P->>DB: SELECT document_id FROM my_app_acl<br/>WHERE subject_type='group'<br/>AND subject_id IN (user.group_ids)<br/>AND (expires_at IS NULL OR expires_at > NOW())
        P->>P: Union des document_ids autorises
        P-->>V: Resultats filtres
    end

    V-->>F: 200 {results[]} (max 50)
```

*Figure 22 : Diagramme de sequence detaille -- Recherche plein texte avec filtrage par permissions*

```mermaid
sequenceDiagram
    participant F as Frontend
    participant V as views.py
    participant QR as qrcode_generator.py
    participant M as QRLink Model
    participant DB as PostgreSQL

    Note over F,DB: Generation QR Code

    F->>V: POST /api/documents/<br/>{title, html}
    V->>DB: INSERT INTO my_app_document
    DB-->>V: Document cree (id)

    V->>M: QRLink.objects.create(<br/>document=doc,<br/>code='doc-{id}-{timestamp}',<br/>active=True)
    M->>DB: INSERT INTO my_app_qrlink
    DB-->>M: QRLink cree

    V->>QR: generate_document_qr_code(document)
    QR->>QR: Recuperer QRLink actif
    QR->>QR: Construire URL: base_url + /api/qr/resolve/{code}/
    QR->>QR: qrcode.make(url, error_correction=L, box_size=10)
    QR->>QR: Redimensionner a 300x300 pixels
    QR->>QR: Sauvegarder en PNG dans ContentFile
    QR-->>V: ContentFile(image_data)

    V->>DB: UPDATE my_app_document<br/>SET qr_code = image_file
    V-->>F: 201 {document, qr_code_url}

    Note over F,DB: Resolution QR Code

    F->>V: GET /api/qr/resolve/{code}/
    V->>DB: SELECT FROM my_app_qrlink<br/>WHERE code=... AND active=True
    DB-->>V: QRLink (document_id)
    V->>DB: SELECT FROM my_app_document<br/>WHERE id=document_id
    V->>DB: INSERT INTO my_app_auditlog<br/>(action=VIEW, qr_link=...)
    V-->>F: 200 {document}
```

*Figure 23 : Diagramme de sequence detaille -- Generation et resolution de QR code*

## 5. Realisation

### a. Environnement de travail

En complement des environnements precedents, les technologies suivantes ont ete utilisees :

**Technologies de partage et recherche :**

| Technologie | Version | Role |
|------------|---------|------|
| qrcode[pil] | 7.4.2+ | Generation de QR codes en Python |
| jsQR | 1.4.0 | Lecture de QR codes cote client (JavaScript) |
| PostgreSQL SearchVector | Natif | Recherche plein texte (tsvector/tsquery) |

**Configuration de la recherche plein texte :**

Le champ `search_tsv` de type `SearchVectorField` est defini sur les modeles `Document` et `DocumentVersion`. Ce champ est indexe et mis a jour automatiquement lors des operations d'ecriture. La configuration linguistique utilisee est `'english'`, permettant la lemmatisation et l'elimination des mots vides.

### b. Interfaces realisees

**Page des documents et QR codes (DocumentsPage.tsx)** : Cette page affiche la liste des documents de l'utilisateur sous forme de cartes. Chaque carte presente le titre du document, les labels associes, la date de creation et un apercu du QR code. L'utilisateur peut telecharger le QR code au format PNG, ouvrir le document dans l'editeur, ou le supprimer.

**Page des liens de partage (ShareLinkPage.tsx)** : Cette interface permet de visualiser et gerer les liens de partage existants pour les documents de l'utilisateur. Pour chaque document, il est possible de creer un nouveau lien avec un role specifique (VIEWER ou EDITOR), de copier le lien dans le presse-papiers et de revoquer un lien existant. La page affiche egalement l'etat de chaque lien (actif, revoque ou expire).

**Interface de recherche** : La recherche est integree a la page des documents. Deux modes sont disponibles :
- **Recherche standard** : Recherche par titre avec possibilite de filtrer par labels. L'endpoint `/api/search/standard/` accepte un parametre `q` pour la requete et `label_ids` pour le filtrage.
- **Recherche approfondie (deep search)** : Recherche dans le contenu complet des documents via l'index tsvector de PostgreSQL. L'endpoint `/api/search/deep/` retourne les documents dont le contenu correspond a la requete, filtres par les permissions de l'utilisateur.

**Page du journal d'audit (AuditLogPage.tsx)** : Cette page affiche l'ensemble des evenements audites pour les documents de l'utilisateur. Chaque entree comprend le type d'action (VIEW, EDIT, SHARE, EXPORT), l'acteur, le document concerne, l'adresse IP, le User-Agent et la date. Les entrees liees a un acces via lien de partage ou QR code sont signalees.

## 6. Tests et validation

| Test | Description | Resultat |
|------|-------------|----------|
| T1 | Generation d'un QR code pour un nouveau document | Le QR code est genere en PNG (300x300) et associe au document. |
| T2 | Resolution d'un QR code valide | Le document est retourne et l'acces est journalise. |
| T3 | Resolution d'un QR code expire ou inactif | Une erreur 404 est retournee. |
| T4 | Creation d'un lien de partage avec role VIEWER | Le token est genere et le lien est fonctionnel. |
| T5 | Acces via lien de partage revoque | Une erreur 403 est retournee. |
| T6 | Recherche standard par titre | Les documents correspondants sont retournes. |
| T7 | Recherche standard avec filtrage par labels | Seuls les documents portant les labels specifies sont retournes. |
| T8 | Recherche plein texte (deep search) | Les documents dont le contenu correspond sont retournes. |
| T9 | Filtrage des resultats par permissions | Un utilisateur ne voit que les documents auxquels il a acces. |
| T10 | Scan QR code via camera (jsQR) | Le QR code est detecte et le document est affiche. |

## 7. Revue de sprint

**Livrables du Sprint 3 :**
- Generateur de QR codes avec stockage d'images et endpoint de resolution.
- Modele QRLink avec gestion d'activation et d'expiration.
- Systeme de liens de partage avec tokens uniques et roles configurables.
- Recherche standard par titre avec filtrage multi-labels.
- Recherche plein texte exploitant PostgreSQL tsvector avec fallback.
- Filtrage systematique des resultats par permissions utilisateur.
- Interfaces frontend pour la gestion des QR codes, des liens de partage et de la recherche.

**Points positifs :**
- Le systeme de QR codes offre un acces rapide et pratique aux documents.
- La recherche plein texte est performante grace a l'index natif PostgreSQL.
- Le filtrage par permissions garantit la confidentialite des donnees.

**Points d'amelioration :**
- L'ajout de la recherche par expressions regulieres ou par proximite constituerait une evolution utile.
- L'integration d'un systeme de notifications lors du partage ameliorerait l'experience utilisateur.
- La possibilite de generer des QR codes personnalises (logo, couleurs) serait un plus esthetique.
