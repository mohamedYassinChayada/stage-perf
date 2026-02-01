# Diagramme de Sequence : Recherche Approfondie (Deep Search)

## Sequence 1 : Recherche plein texte -- Vue systeme

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant B as Backend Django
    participant DB as PostgreSQL

    U->>F: Saisir requete dans le champ<br/>de recherche approfondie
    F->>F: Valider que la requete<br/>n'est pas vide
    F->>B: GET /api/search/deep/?q=requete<br/>(Authorization: Token ...)
    B->>B: Extraire parametre q

    B->>B: _permission_filter_queryset(request)
    Note right of B: Construire le queryset<br/>filtre par permissions

    alt Administrateur (is_staff / is_superuser)
        B->>DB: SELECT * FROM my_app_document
        DB-->>B: Tous les documents
    else Utilisateur normal
        B->>DB: SELECT id FROM my_app_document<br/>WHERE owner_id = user.id
        B->>DB: SELECT document_id FROM my_app_acl<br/>WHERE subject_type='user'<br/>AND subject_id=user.id<br/>AND (expires_at IS NULL OR expires_at > NOW())
        B->>DB: SELECT document_id FROM my_app_acl<br/>WHERE subject_type='group'<br/>AND subject_id IN (user.group_ids)<br/>AND (expires_at IS NULL OR expires_at > NOW())
        DB-->>B: Documents autorises (UNION)
    end

    B->>B: SearchQuery(q, config='english')
    B->>DB: SELECT * FROM my_app_document<br/>WHERE search_tsv @@ to_tsquery('english', 'requete')<br/>AND id IN (documents_autorises)
    DB-->>B: Resultats tsvector

    alt Resultats trouves
        B->>B: Ordonner par updated_at DESC
    else Aucun resultat tsvector
        B->>DB: SELECT * FROM my_app_document<br/>WHERE search_tsv @@ plainto_tsquery('requete')<br/>AND id IN (documents_autorises)
        DB-->>B: Resultats fallback
        alt Toujours aucun resultat ou erreur
            B->>DB: SELECT * FROM my_app_document<br/>WHERE text ILIKE '%requete%'<br/>AND id IN (documents_autorises)
            DB-->>B: Resultats ILIKE (fallback final)
        end
    end

    B->>B: Limiter a 50 resultats
    B->>B: Serialiser avec DocumentListSerializer
    B-->>F: 200 {results: documents[]}
    F->>F: Mettre a jour l'etat searchResults
    F-->>U: Afficher les documents trouves
```

## Sequence 2 : Recherche plein texte -- Vue detaillee (composants internes)

```mermaid
sequenceDiagram
    participant F as DocumentsPage.tsx
    participant DS as documentService.ts<br/>searchDeep()
    participant V as views.py<br/>search_deep()
    participant PF as views.py<br/>_permission_filter_queryset()
    participant SQ as Django SearchQuery
    participant DB as PostgreSQL<br/>(GIN Index sur search_tsv)

    F->>DS: searchDeep(query)
    DS->>DS: Encoder query dans URL
    DS->>V: GET /api/search/deep/?q=query<br/>Headers: Authorization Token

    V->>V: request.GET.get('q').strip()
    alt q est vide
        V-->>DS: 400 {error: 'q required'}
        DS-->>F: Erreur affichee
    end

    V->>PF: _permission_filter_queryset(request)
    PF->>PF: Verifier request.user.is_authenticated
    PF->>PF: Verifier is_staff / is_superuser

    alt Utilisateur normal
        PF->>DB: Requete ACL directes (subject_type='user')
        PF->>DB: Requete ACL groupes (subject_type='group')
        PF->>PF: Combiner avec Q(owner=user)<br/>| Q(id__in=user_acls)<br/>| Q(id__in=group_acls)
        PF-->>V: QuerySet filtre (.distinct())
    else Administrateur
        PF-->>V: Document.objects.all()
    end

    V->>V: Verifier connection.vendor == 'postgresql'

    alt PostgreSQL disponible
        V->>SQ: SearchQuery(q, config='english')
        SQ-->>V: Objet SearchQuery
        V->>DB: qs.filter(search_tsv__search=query)<br/>utilise index GIN
        DB-->>V: Resultats via tsvector

        alt Resultats vides (qs2.exists() == False)
            V->>DB: qs.filter(search_tsv__search=q)<br/>(recherche brute sans config)
            DB-->>V: Resultats fallback tsvector
        end
    else Autre base de donnees
        V->>DB: qs.filter(text__icontains=q)
        DB-->>V: Resultats ILIKE
    end

    V->>V: .select_related('owner')
    V->>V: .order_by('-updated_at')[:50]
    V->>V: DocumentListSerializer(qs, many=True)
    V-->>DS: 200 [{id, title, owner, updated_at, labels, ...}]
    DS-->>F: Liste de documents

    F->>F: setSearchResults(documents)
    F->>F: Afficher cartes de resultats<br/>avec role et labels
```

## Sequence 3 : Recherche standard vs recherche approfondie -- Comparaison

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant F as Frontend React
    participant B as Backend Django
    participant DB as PostgreSQL

    Note over U,DB: Mode 1 : Recherche Standard (par titre)

    U->>F: Saisir "rapport" + selectionner labels
    F->>B: GET /api/search/standard/?q=rapport&label_ids=uuid1,uuid2
    B->>B: _permission_filter_queryset(request)
    B->>DB: WHERE title ILIKE '%rapport%'<br/>AND documentlabel.label_id IN (uuid1, uuid2)
    DB-->>B: Documents filtres par titre et labels
    B-->>F: 200 {results[]}
    F-->>U: Resultats par titre

    Note over U,DB: Mode 2 : Recherche Approfondie (dans le contenu)

    U->>F: Saisir "budget annuel" en mode deep search
    F->>B: GET /api/search/deep/?q=budget annuel
    B->>B: _permission_filter_queryset(request)
    B->>DB: WHERE search_tsv @@ to_tsquery('english',<br/>'budget & annuel')
    Note right of DB: PostgreSQL decompose la requete<br/>en lexemes et utilise l'index GIN<br/>pour une recherche rapide
    DB-->>B: Documents contenant "budget" ET "annuel"
    B-->>F: 200 {results[]}
    F-->>U: Resultats par contenu
```
