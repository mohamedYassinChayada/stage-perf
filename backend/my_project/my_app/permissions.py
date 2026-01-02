from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import ACL, Document, ShareLink, Role, Action
from django.contrib.auth.models import Group
from django.utils import timezone
from django.db.models import Q


def get_user_effective_role(user, document: Document) -> str:
	"""Get the highest role a user has for a document (direct ACL, group ACL, or ownership)."""
	if not user or not user.is_authenticated:
		return None
	
	# Admin users have all rights
	if user.is_staff or user.is_superuser:
		return Role.OWNER
	
	# Check if user is the owner
	if document.owner_id == user.id:
		return Role.OWNER
	
	# Check direct user ACLs
	user_acls = ACL.objects.filter(
		document=document, 
		subject_type='user', 
		subject_id=str(user.id)
	).filter(
		Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
	)
	
	# Check group ACLs
	user_groups = user.groups.values_list('id', flat=True)
	group_acls = ACL.objects.filter(
		document=document,
		subject_type='group',
		subject_id__in=[str(group_id) for group_id in user_groups]
	).filter(
		Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
	)
	
	# Get all applicable ACLs and find the highest role
	all_acls = list(user_acls) + list(group_acls)
	if not all_acls:
		return None
	
	# Role hierarchy: OWNER > EDITOR > VIEWER
	role_priority = {Role.OWNER: 3, Role.EDITOR: 2, Role.VIEWER: 1}
	highest_role = max(all_acls, key=lambda acl: role_priority.get(acl.role, 0))
	return highest_role.role


def user_can_perform_action(user, document: Document, action: str) -> bool:
	"""Check if user can perform a specific action on a document based on their role."""
	role = get_user_effective_role(user, document)
	if not role:
		return False
	
	# Define what each role can do
	role_permissions = {
		Role.OWNER: [Action.VIEW, Action.EDIT, Action.SHARE, Action.EXPORT],
		Role.EDITOR: [Action.VIEW, Action.EDIT, Action.EXPORT],
		Role.VIEWER: [Action.VIEW, Action.EXPORT]
	}
	
	return action in role_permissions.get(role, [])


def user_has_document_access(user, document: Document) -> bool:
	"""Check if user has any access to a document."""
	return get_user_effective_role(user, document) is not None


class DocumentAccessPermission(BasePermission):
	"""
	Permission class that enforces proper RBAC for documents.
	Checks ownership, direct ACLs, group ACLs, and role-based actions.
	"""
	
	def has_object_permission(self, request, view, obj: Document):
		# Admin users have full access
		if request.user.is_staff or request.user.is_superuser:
			return True
		
		# Map HTTP methods to actions
		if request.method in SAFE_METHODS:
			return user_can_perform_action(request.user, obj, Action.VIEW)
		elif request.method in ['PUT', 'PATCH']:
			return user_can_perform_action(request.user, obj, Action.EDIT)
		elif request.method == 'DELETE':
			# Only owners can delete
			role = get_user_effective_role(request.user, obj)
			return role == Role.OWNER
		else:
			return user_can_perform_action(request.user, obj, Action.EDIT)

	def has_permission(self, request, view):
		return request.user and request.user.is_authenticated


class ShareLinkAccessPermission(BasePermission):
	"""Permission for accessing documents via share links."""
	
	def has_permission(self, request, view):
		# Share link access is handled in the view logic
		return True
		
	def has_object_permission(self, request, view, obj):
		# For share link access, the view should handle the logic
		return True


