from django.db import models
from django.urls import reverse
from django.conf import settings
from django.contrib.postgres.search import SearchVectorField
import uuid


class Role(models.TextChoices):
	OWNER = "OWNER", "OWNER"
	EDITOR = "EDITOR", "EDITOR"
	VIEWER = "VIEWER", "VIEWER"


class Action(models.TextChoices):
	VIEW = "VIEW", "VIEW"
	EDIT = "EDIT", "EDIT"
	SHARE = "SHARE", "SHARE"
	EXPORT = "EXPORT", "EXPORT"


class RelationType(models.TextChoices):
	RELATED = "RELATED", "RELATED"
	REVISION_OF = "REVISION_OF", "REVISION_OF"
	REFERENCES = "REFERENCES", "REFERENCES"


class Document(models.Model):
	"""
	Document core record. Aligns with PlantUML schema.

	Notes:
	- Keeping existing 'file' and 'qr_code' fields for backward compatibility,
	  but attachments should go to Attachment table and QR linking to QRLink.
	"""
	# Backward compatibility (existing auto PK retained to avoid destructive migration right now)
	title = models.CharField(max_length=255, help_text="Title of the document")
	# New fields as per schema
	html = models.TextField(blank=True, null=True, help_text="HTML source of truth for the document")
	text = models.TextField(blank=True, null=True, help_text="Plain text generated from HTML for search indexing")
	search_tsv = SearchVectorField(null=True, help_text="Full-text search vector")
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='owned_documents', null=True, blank=True)
	current_version_no = models.IntegerField(default=1, help_text="Current version number")
	# QR code image stored as binary in the database (Neon cloud DB)
	qr_code_data = models.BinaryField(blank=True, null=True, help_text="QR code PNG image stored as binary in the database")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['-created_at']
		verbose_name = 'Document'
		verbose_name_plural = 'Documents'

	def __str__(self):
		return f"{self.title} (ID: {self.id})"

	def get_absolute_url(self):
		return reverse('my_app:document_detail', kwargs={'pk': self.id})

	def get_qr_code_resolve_url(self) -> str:
		"""Return the QR resolve URL using the primary active QRLink if any."""
		base_url = getattr(settings, 'BASE_URL', 'http://localhost:8000')
		primary_qr = QRLink.objects.filter(document=self, active=True).order_by('-created_at').first()
		if primary_qr:
			return f"{base_url}/api/qr/resolve/{primary_qr.code}/"
		return f"{base_url}/api/documents/{self.id}/"

	def delete(self, *args, **kwargs):
		super().delete(*args, **kwargs)


# Using Django's built-in auth.Group and auth.User.groups instead of custom models


class DocumentVersion(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
	version_no = models.IntegerField()
	html = models.TextField(blank=True, null=True)
	text = models.TextField(blank=True, null=True)
	search_tsv = SearchVectorField(null=True)
	author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='authored_versions', null=True, blank=True)
	change_note = models.TextField(blank=True, null=True)
	hash = models.TextField(blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		unique_together = (('document', 'version_no'),)


class Label(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	name = models.TextField(unique=True)

	def __str__(self):
		return self.name


class DocumentLabel(models.Model):
	document = models.ForeignKey(Document, on_delete=models.CASCADE)
	label = models.ForeignKey(Label, on_delete=models.CASCADE)

	class Meta:
		unique_together = (('document', 'label'),)


class Collection(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	name = models.TextField()
	parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
	owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='collections', null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.name


class DocumentCollection(models.Model):
	document = models.ForeignKey(Document, on_delete=models.CASCADE)
	collection = models.ForeignKey(Collection, on_delete=models.CASCADE)

	class Meta:
		unique_together = (('document', 'collection'),)


class DocumentRelation(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	from_document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='relations_from')
	to_document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='relations_to')
	type = models.CharField(max_length=32, choices=RelationType.choices)


class Attachment(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='attachments')
	version_no = models.IntegerField(null=True, blank=True)
	media_type = models.TextField()
	filename = models.TextField()
	data = models.BinaryField()
	metadata = models.JSONField()
	created_at = models.DateTimeField(auto_now_add=True)


class ACL(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='acls')
	subject_type = models.CharField(max_length=16, choices=(('user', 'user'), ('group', 'group'), ('share_link', 'share_link')))
	subject_id = models.TextField()
	role = models.CharField(max_length=16, choices=Role.choices)
	expires_at = models.DateTimeField(null=True, blank=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='created_acls', null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)


class ShareLink(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='share_links')
	role = models.CharField(max_length=16, choices=Role.choices)
	token = models.TextField(unique=True)
	expires_at = models.DateTimeField(null=True, blank=True)
	revoked_at = models.DateTimeField(null=True, blank=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='created_share_links', null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)


class QRLink(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='qr_links')
	version_no = models.IntegerField(null=True, blank=True)
	code = models.TextField(unique=True)
	sig = models.TextField(null=True, blank=True)
	expires_at = models.DateTimeField(null=True, blank=True)
	active = models.BooleanField(default=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='created_qr_links', null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)


class AuditLog(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	actor_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_logs')
	action = models.CharField(max_length=16, choices=Action.choices)
	document = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL)
	version_no = models.IntegerField(null=True, blank=True)
	ts = models.DateTimeField(auto_now_add=True)
	ip = models.GenericIPAddressField(null=True, blank=True)
	user_agent = models.TextField(null=True, blank=True)
	context = models.JSONField(null=True, blank=True)
	share_link = models.ForeignKey(ShareLink, null=True, blank=True, on_delete=models.SET_NULL)
	qr_link = models.ForeignKey(QRLink, null=True, blank=True, on_delete=models.SET_NULL)


class UserProfile(models.Model):
	user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
	avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
