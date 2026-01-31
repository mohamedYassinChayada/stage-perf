from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import ACL, Document, ShareLink, Role, Action
from django.contrib.auth.models import Group
from django.utils import timezone
from django.db.models import Q


# Define role hierarchy for conflict resolution - highest privilege wins
ROLE_HIERARCHY = {
	Role.OWNER: 3,
	Role.EDITOR: 2,
	Role.VIEWER: 1,
}


def get_user_effective_role(user, document: Document) -> str:
	"""Get the highest role a user has for a document (ownership, direct ACL, or group ACL).
	
	When a user has multiple access rights (e.g., direct user ACL + group ACL),
	this function resolves conflicts by returning the highest privilege role.
	"""
	if not user or not user.is_authenticated:
		return None
	
	# Admin users have all rights
	if user.is_staff or user.is_superuser:
		return Role.OWNER
	
	# Collect all applicable roles
	roles = []
	
	# Check ownership
	if document.owner_id == user.id:
		roles.append(Role.OWNER)
	
	# Check direct user ACLs (filter out expired ones)
	user_acl = ACL.objects.filter(
		document=document, 
		subject_type='user', 
		subject_id=str(user.id)
	).filter(
		Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
	).first()
	if user_acl:
		roles.append(user_acl.role)
	
	# Check group ACLs (filter out expired ones)
	user_groups = user.groups.values_list('id', flat=True)
	group_acls = ACL.objects.filter(
		document=document,
		subject_type='group',
		subject_id__in=[str(group_id) for group_id in user_groups]
	).filter(
		Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
	)
	for acl in group_acls:
		roles.append(acl.role)
	
	# If no roles found, user has no access
	if not roles:
		return None
	
	# Return highest privilege role (conflict resolution)
	return max(roles, key=lambda r: ROLE_HIERARCHY.get(r, 0))


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


