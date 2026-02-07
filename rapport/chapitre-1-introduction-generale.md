# Chapitre I : Introduction Generale

## 1. Presentation de l'organisme d'accueil

*(Section a completer ulterieurement avec les informations relatives a l'organisme d'accueil.)*

## 2. Contexte et problematique

La transformation numerique constitue aujourd'hui un enjeu majeur pour les entreprises et les administrations. La gestion documentaire, longtemps fondee sur des processus manuels et des supports papier, se trouve au coeur de cette mutation. Les organisations font face a plusieurs defis recurrents : la digitalisation de documents physiques, la collaboration autour de contenus partages, le controle des acces et la tracabilite des modifications.

Les solutions existantes sur le marche presentent souvent des limitations significatives. Certaines se concentrent uniquement sur le stockage de fichiers sans offrir d'edition en ligne. D'autres proposent des fonctionnalites d'OCR (Reconnaissance Optique de Caracteres) mais sans integration avec un editeur de documents. Par ailleurs, la gestion fine des droits d'acces et l'audit des actions restent des fonctionnalites souvent absentes ou insuffisamment developpees dans les outils disponibles.

La problematique qui se degage est la suivante : **comment concevoir et developper une solution integree de gestion documentaire qui combine la digitalisation par OCR, l'edition collaborative en ligne, le controle d'acces granulaire et la tracabilite complete des operations, tout en offrant une experience utilisateur moderne et intuitive ?**

## 3. Objectifs du projet

Le projet vise a developper un systeme de gestion documentaire complet repondant aux objectifs suivants :

- **Digitalisation de documents** : Integrer un moteur OCR (EasyOCR) permettant l'extraction automatique de texte a partir d'images et de fichiers PDF, avec detection de la mise en page et des positions des blocs de texte.

- **Edition de documents en ligne** : Fournir un editeur riche de type traitement de texte (base sur TinyMCE) avec gestion multi-pages, sauts de page dynamiques 

- **Gestion des versions** : Implementer un systeme complet de versionnement des documents, permettant de consulter l'historique des modifications et de restaurer des versions anterieures.

- **Controle d'acces et partage securise** : Mettre en place un systeme RBAC (Role-Based Access Control) avec trois niveaux de roles (Proprietaire, Editeur, Lecteur), des liens de partage avec tokens, et une generation de QR codes pour un acces rapide.

- **Organisation et recherche** : Offrir des mecanismes d'organisation par collections hierarchiques et labels, ainsi qu'une recherche plein texte exploitant les capacites natives de PostgreSQL (tsvector).

- **Tracabilite et audit** : Enregistrer un journal d'audit complet de toutes les actions effectuees sur les documents (consultation, modification, partage, export).

- **Deploiement cloud** : Deployer l'application sur une infrastructure cloud moderne avec Azure Container Apps pour le backend, Vercel pour le frontend, et Neon Cloud pour la base de donnees PostgreSQL, avec un pipeline CI/CD via GitHub Actions.

## 4. Methodologie adoptee : Scrum

Pour mener a bien ce projet, la methodologie agile **Scrum** a ete adoptee. Ce choix se justifie par la nature iterative et incrementale du developpement, qui permet de livrer des fonctionnalites utilisables a la fin de chaque sprint et d'integrer les retours de maniere continue.

Le projet a ete decoupe en **quatre sprints** :

- **Sprint 1** : Authentification et gestion des utilisateurs -- mise en place du socle applicatif avec le systeme d'authentification par tokens, le modele RBAC et le journal d'audit.

- **Sprint 2** : OCR et editeur documentaire -- integration du moteur OCR, developpement de l'editeur multi-pages, gestion des versions, labels et collections.

- **Sprint 3** : Partage securise et recherche -- implementation des QR codes, des liens de partage, de la recherche plein texte et de l'interface de recherche avancee.

- **Sprint 4** : Administration, notifications et processus d'approbation -- developpement du tableau de bord administrateur, du systeme de notifications en temps reel, de la verification d'e-mail et du workflow d'approbation des comptes.

Chaque sprint a suivi le cycle Scrum classique : planification, developpement, revue et retrospective.

## 5. Plan du rapport

Le present rapport est structure en sept chapitres :

- **Chapitre I : Introduction Generale** -- Presentation du contexte, de la problematique, des objectifs et de la methodologie adoptee.

- **Chapitre II : Etude Prealable** -- Analyse de l'existant, specification des besoins fonctionnels et non fonctionnels, et planification du projet selon Scrum.

- **Chapitre III : Sprint 1** -- Authentification et gestion des utilisateurs, incluant la conception, la realisation et les tests.

- **Chapitre IV : Sprint 2** -- OCR et editeur documentaire, couvrant l'integration de l'OCR, le developpement de l'editeur et la gestion des versions.

- **Chapitre V : Sprint 3** -- Partage securise et recherche, detaillant les QR codes, les liens de partage et la recherche plein texte.

- **Chapitre VI : Sprint 4** -- Administration, notifications et processus d'approbation, couvrant le tableau de bord administrateur, le systeme de notifications et la verification d'e-mail.

- **Chapitre VII : Conclusion Generale** -- Bilan du travail, difficultes rencontrees, competences acquises et perspectives d'amelioration.
