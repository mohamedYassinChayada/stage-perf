"""
URL configuration for my_app OCR and Document management endpoints.
"""

from django.urls import path
from . import views

app_name = 'my_app'

urlpatterns = [
    # OCR endpoints
    path('ocr/extract/', views.ocr_extract_text, name='ocr_extract_text'),
    path('ocr/extract-detailed/', views.ocr_extract_detailed, name='ocr_extract_detailed'),
    path('ocr/info/', views.ocr_info, name='ocr_info'),
    
    # Document management endpoints
    path('documents/', views.DocumentListCreateView.as_view(), name='document_list_create'),
    path('documents/<int:pk>/', views.DocumentDetailView.as_view(), name='document_detail'),
    path('documents/<int:pk>/qrcode/', views.document_qr_code, name='document_qr_code'),
    
    # QR Code system endpoints
    path('qr-codes/info/', views.qr_code_info, name='qr_code_info'),
    path('qr/resolve/<str:code>/', views.resolve_qr, name='qr_resolve'),

    # Auth endpoints
    path('auth/register/', views.register, name='auth_register'),
    path('auth/me/', views.me, name='auth_me'),
    path('auth/login/', views.login_view, name='auth_login'),
    path('auth/logout/', views.logout_view, name='auth_logout'),
    path('auth/users/', views.list_users, name='auth_users'),

    # Sharing & ACL
    path('documents/<int:pk>/share/', views.document_share_create, name='document_share_create'),
    path('documents/<int:pk>/shares/', views.document_shares_list, name='document_shares_list'),
    path('shares/<uuid:share_id>/', views.share_delete, name='share_delete'),

    # Attachments
    path('attachments/<uuid:attachment_id>/download/', views.attachment_download, name='attachment_download'),

    # Labels
    path('labels/', views.labels_list, name='labels_list'),
    path('labels/create/', views.label_create, name='label_create'),
    path('documents/<int:pk>/labels/', views.document_set_labels, name='document_set_labels'),

    # Collections
    path('collections/', views.collections_list, name='collections_list'),
    path('collections/create/', views.collection_create, name='collection_create'),
    path('collections/<uuid:collection_id>/', views.collection_detail, name='collection_detail'),
    path('collections/<uuid:collection_id>/delete/', views.collection_delete, name='collection_delete'),
    path('documents/<int:pk>/collections/', views.document_set_collections, name='document_set_collections'),

    # Search
    path('search/standard/', views.search_standard, name='search_standard'),
    path('search/deep/', views.search_deep, name='search_deep'),
    path('search/qr/', views.search_qr, name='search_qr'),

    # Groups
    path('groups/', views.groups_list_create, name='groups_list_create'),
    path('groups/<int:group_id>/', views.group_detail, name='group_detail'),
    path('groups/<int:group_id>/members/', views.group_members, name='group_members'),
    path('groups/<int:group_id>/members/<int:user_id>/', views.group_member_remove, name='group_member_remove'),

    # Share Links
    path('documents/<int:document_id>/share-links/', views.document_share_links, name='document_share_links'),
    path('share-links/<uuid:share_link_id>/revoke/', views.share_link_revoke, name='share_link_revoke'),
    path('share-links/<str:token>/', views.share_link_access, name='share_link_access'),

    # Audit Logging and Version History
    path('documents/<int:document_id>/audit/', views.document_audit_log, name='document_audit_log'),
    path('documents/<int:document_id>/versions/', views.document_version_history, name='document_version_history'),
    path('documents/<int:document_id>/versions/<uuid:version_id>/', views.document_version_detail, name='document_version_detail'),
    path('documents/<int:document_id>/restore/', views.document_restore_version, name='document_restore_version'),
] 