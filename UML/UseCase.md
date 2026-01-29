Version A -- Grouped by Subsystem

  graph TB
      subgraph Actors
          U((User))
          A((Admin))
          AN((Anonymous))
      end

      subgraph "Authentication"
          UC1[Register]
          UC2[Login]
          UC3[Logout]
          UC4[View Profile]
      end

      subgraph "Document Management"
          UC5[Create Document]
          UC6[Edit Document]
          UC7[Delete Document]
          UC8[View Document]
          UC9[List My Documents]
          UC10[Export Document]
      end

      subgraph "Version Control"
          UC11[View Version History]
          UC12[View Version Detail]
          UC13[Restore Version]
      end

      subgraph "OCR Processing"
          UC14[Extract Text from Image]
          UC15[Extract Text with Positions]
          UC16[View OCR Info]
      end

      subgraph "Sharing & Permissions"
          UC17[Share with User/Group]
          UC18[Create Share Link]
          UC19[Revoke Share Link]
          UC20[Access via Share Link]
          UC21[Manage ACLs]
      end

      subgraph "QR Codes"
          UC22[Generate QR Code]
          UC23[Resolve QR Code]
          UC24[Search by QR Image]
      end

      subgraph "Organization"
          UC25[Manage Labels]
          UC26[Tag Documents]
          UC27[Manage Collections]
          UC28[Assign to Collection]
      end

      subgraph "Search"
          UC29[Standard Search - Title]
          UC30[Deep Search - Full Text]
      end

      subgraph "Groups"
          UC31[Create Group]
          UC32[Add Members]
          UC33[Remove Members]
      end

      subgraph "Audit"
          UC34[View Audit Log]
      end

      U --> UC1 & UC2 & UC3 & UC4
      U --> UC5 & UC6 & UC7 & UC8 & UC9 & UC10
      U --> UC11 & UC12 & UC13
      U --> UC14 & UC15 & UC16
      U --> UC17 & UC18 & UC19 & UC21
      U --> UC22 & UC24
      U --> UC25 & UC26 & UC27 & UC28
      U --> UC29 & UC30
      U --> UC31 & UC32 & UC33
      U --> UC34
      A --> UC7
      A --> UC33
      AN --> UC20
      AN --> UC23
      UC5 -.->|includes| UC22
      UC6 -.->|includes| UC11

  Version B -- Flat Actor-Centric View

  graph LR
      U((Authenticated User))
      A((Admin))
      AN((Anonymous User))

      U --- Register
      U --- Login
      U --- Logout
      U --- CreateDocument
      U --- EditDocument
      U --- DeleteDocument
      U --- ViewDocument
      U --- ListDocuments
      U --- UploadFileOCR
      U --- DetailedOCR
      U --- ShareDocument
      U --- CreateShareLink
      U --- RevokeShareLink
      U --- ManageLabels
      U --- ManageCollections
      U --- StandardSearch
      U --- DeepSearch
      U --- QRSearch
      U --- ViewVersionHistory
      U --- RestoreVersion
      U --- ViewAuditLog
      U --- CreateGroup
      U --- ManageGroupMembers

      A --- DeleteAnyDocument
      A --- DeleteGroup
      A --- ViewAllDocuments
      A --- ViewAllGroups

      AN --- AccessViaShareLink
      AN --- ResolveQRCode

  Version C -- Domain-Oriented (Fewer Details, High Level)

  graph TB
      U((User))
      A((Admin))
      AN((Anonymous))

      U --> Auth[Authenticate]
      U --> DocMgmt[Manage Documents]
      U --> Organize[Organize - Labels & Collections]
      U --> Share[Share & Collaborate]
      U --> Search[Search Documents]
      U --> OCR[OCR Processing]
      U --> Audit[View Audit Trail]

      A --> AdminOps[Administer System]

      AN --> PublicAccess[Access via Share/QR Link]

      DocMgmt --> VersionCtrl[Version Control]
      DocMgmt --> QR[QR Code Generation]
      Share --> GroupMgmt[Group Management]
      Share --> LinkSharing[Link-Based Sharing]
      Share --> ACLMgmt[ACL Permissions]
