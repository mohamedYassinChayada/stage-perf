"""
Audit logging utilities for document management system.
Implements audit trail as per project rules and database model.
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import AuditLog, Action, Document, ShareLink, QRLink
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


def get_client_ip(request):
    """Extract client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def get_user_agent(request):
    """Extract user agent from request."""
    return request.META.get('HTTP_USER_AGENT', '')


def log_audit_event(
    action: str,
    request=None,
    actor_user=None,
    document=None,
    version_no=None,
    context=None,
    share_link=None,
    qr_link=None
):
    """
    Log an audit event.
    
    Args:
        action: Action type (VIEW, EDIT, SHARE, EXPORT)
        request: Django request object (optional, for IP/user-agent extraction)
        actor_user: User who performed the action (optional)
        document: Document involved (optional)
        version_no: Document version number (optional)
        context: Additional context as dict (optional)
        share_link: ShareLink used (optional)
        qr_link: QRLink used (optional)
    """
    try:
        # Extract user from request if not provided
        if request and not actor_user and hasattr(request, 'user') and request.user.is_authenticated:
            actor_user = request.user
        
        # Extract IP and user agent from request
        ip = None
        user_agent = None
        if request:
            ip = get_client_ip(request)
            user_agent = get_user_agent(request)
        
        # Create audit log entry
        audit_entry = AuditLog.objects.create(
            actor_user=actor_user,
            action=action,
            document=document,
            version_no=version_no,
            ts=timezone.now(),
            ip=ip,
            user_agent=user_agent,
            context=context or {},
            share_link=share_link,
            qr_link=qr_link
        )
        
        logger.info(f"Audit log created: {action} by {actor_user} on document {document}")
        return audit_entry
        
    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")
        return None


def log_document_view(request, document, version_no=None, share_link=None, qr_link=None):
    """Log document view action."""
    context = {
        'document_title': document.title if document else None,
        'access_method': 'share_link' if share_link else 'qr_link' if qr_link else 'direct'
    }
    return log_audit_event(
        action=Action.VIEW,
        request=request,
        document=document,
        version_no=version_no,
        context=context,
        share_link=share_link,
        qr_link=qr_link
    )


def log_document_edit(request, document, version_no=None, changes=None):
    """Log document edit action."""
    context = {
        'document_title': document.title if document else None,
        'changes': changes or {},
        'version_created': version_no
    }
    return log_audit_event(
        action=Action.EDIT,
        request=request,
        document=document,
        version_no=version_no,
        context=context
    )


def log_document_share(request, document, shared_with=None, role=None):
    """Log document share action."""
    context = {
        'document_title': document.title if document else None,
        'shared_with': shared_with,
        'role_granted': role
    }
    return log_audit_event(
        action=Action.SHARE,
        request=request,
        document=document,
        context=context
    )


def log_document_export(request, document, export_format=None):
    """Log document export action."""
    context = {
        'document_title': document.title if document else None,
        'export_format': export_format
    }
    return log_audit_event(
        action=Action.EXPORT,
        request=request,
        document=document,
        context=context
    )


def log_access_revoked(request, document, revoked_from=None):
    """Log when access is revoked from a user/group."""
    context = {
        'document_title': document.title if document else None,
        'revoked_from': revoked_from
    }
    return log_audit_event(
        action=Action.SHARE,
        request=request,
        document=document,
        context=context
    )


class AuditMiddleware:
    """
    Middleware to automatically log certain actions.
    This is optional - we can also log manually in views.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        response = self.get_response(request)
        
        # Log certain API endpoints automatically
        if request.path.startswith('/api/documents/') and request.method == 'GET':
            # This would log all document views, but might be too verbose
            # Better to log manually in views for more control
            pass
        
        return response
