"""
Serializers for OCR functionality and Document management using Django REST Framework.
"""

from rest_framework import serializers
from django.core.files.uploadedfile import UploadedFile
try:
    from bs4 import BeautifulSoup
except Exception:  # Fallback if bs4 isn't available in non-venv runs
    BeautifulSoup = None
from .models import Document, QRLink, Attachment, Label, Collection, ShareLink, ACL, DocumentVersion, AuditLog
from django.contrib.auth.models import Group
from .utils.ocr import is_supported_file_type, validate_file_size

class OCRUploadSerializer(serializers.Serializer):
    """
    Serializer for handling file uploads for OCR processing.
    """
    file = serializers.FileField(
        help_text="Upload an image (PNG, JPEG) or PDF file for OCR text extraction",
        allow_empty_file=False,
        required=True
    )
    
    def validate_file(self, value: UploadedFile) -> UploadedFile:
        """
        Validate the uploaded file for OCR processing.
        
        Args:
            value: The uploaded file
            
        Returns:
            The validated file
            
        Raises:
            ValidationError: If file is invalid
        """
        # Check if file exists and has content
        if not value:
            raise serializers.ValidationError("No file was uploaded.")
        
        if not hasattr(value, 'name') or not value.name:
            raise serializers.ValidationError("File must have a valid filename.")
        
        # Validate file type
        if not is_supported_file_type(value.name):
            raise serializers.ValidationError(
                "Unsupported file type. Please upload PNG, JPEG, or PDF files only."
            )
        
        # Validate file size
        file_size = value.size
        is_valid_size, size_error = validate_file_size(file_size)
        if not is_valid_size:
            raise serializers.ValidationError(size_error)
        
        # Additional validation for empty files
        if file_size == 0:
            raise serializers.ValidationError("The uploaded file is empty.")
        
        return value

class OCRResponseSerializer(serializers.Serializer):
    """
    Serializer for OCR API response.
    """
    success = serializers.BooleanField(
        help_text="Whether the OCR processing was successful"
    )
    extracted_text = serializers.CharField(
        help_text="The text extracted from the uploaded file",
        allow_blank=True
    )
    filename = serializers.CharField(
        help_text="Original filename of the processed file"
    )
    file_type = serializers.CharField(
        help_text="Type of file that was processed (image or pdf)"
    )
    processing_time = serializers.FloatField(
        help_text="Time taken to process the file (in seconds)",
        required=False
    )
    message = serializers.CharField(
        help_text="Additional message or error details",
        required=False,
        allow_blank=True
    )

class OCRErrorSerializer(serializers.Serializer):
    """
    Serializer for OCR error responses.
    """
    error = serializers.CharField(
        help_text="Error message describing what went wrong"
    )
    error_code = serializers.CharField(
        help_text="Error code for programmatic handling"
    )
    details = serializers.DictField(
        help_text="Additional error details",
        required=False
    )

class DocumentSerializer(serializers.ModelSerializer):
    """
    Serializer for Document model with QR code support.
    """
    qr_code_url = serializers.SerializerMethodField()
    qr_resolve_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    document_url = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    collections = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    user_permissions = serializers.SerializerMethodField()
    owner_username = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'file_url', 'attachments', 'html', 'text', 'qr_code',
            'qr_code_url', 'qr_resolve_url', 'document_url', 'labels', 'collections', 'created_at', 'updated_at',
            'user_role', 'user_permissions', 'owner_username'
        ]
        read_only_fields = ['id', 'qr_code', 'created_at', 'updated_at']
    
    def get_qr_code_url(self, obj):
        """Get the full URL for the QR code image."""
        if obj.qr_code:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.qr_code.url)
            return obj.qr_code.url
        return None
    
    def get_file_url(self, obj):
        """Return URL to first attachment download as original file URL."""
        request = self.context.get('request')
        first = obj.attachments.order_by('created_at').first()
        if not first or not request:
            return None
        from django.urls import reverse
        url = reverse('my_app:attachment_download', kwargs={'attachment_id': str(first.id)})
        return request.build_absolute_uri(url)

    def get_attachments(self, obj):
        request = self.context.get('request')
        items = []
        for att in obj.attachments.all():
            url = None
            if request:
                from django.urls import reverse
                url = request.build_absolute_uri(reverse('my_app:attachment_download', kwargs={'attachment_id': str(att.id)}))
            items.append({
                'id': str(att.id),
                'filename': att.filename,
                'media_type': att.media_type,
                'created_at': att.created_at,
                'url': url,
            })
        return items
    
    def get_document_url(self, obj):
        """Get the URL that the QR code points to."""
        return obj.get_qr_code_resolve_url()

    def get_qr_resolve_url(self, obj):
        return obj.get_qr_code_resolve_url()

    def update(self, instance, validated_data):
        html = validated_data.get('html', None)
        if html is not None:
            instance.html = html
            # regenerate plain text from HTML
            if BeautifulSoup:
                instance.text = BeautifulSoup(html, 'html.parser').get_text("\n")
            else:
                # minimal fallback: strip tags naïvely
                import re
                instance.text = re.sub('<[^<]+?>', '', html)
        title = validated_data.get('title', None)
        if title is not None:
            instance.title = title
        # File uploads are handled via Attachment, not on Document
        instance.save()
        return instance

    def get_labels(self, obj):
        items = Label.objects.filter(documentlabel__document=obj).values('id', 'name')
        return list(items)

    def get_collections(self, obj):
        items = Collection.objects.filter(documentcollection__document=obj).values('id', 'name', 'parent_id')
        return list(items)

    def get_user_role(self, obj):
        """Get the current user's role for this document."""
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None
        
        from .permissions import get_user_effective_role
        return get_user_effective_role(request.user, obj)

    def get_user_permissions(self, obj):
        """Get the current user's permissions for this document."""
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return []
        
        from .permissions import user_can_perform_action
        from .models import Action
        
        permissions = []
        actions = [Action.VIEW, Action.EDIT, Action.SHARE, Action.EXPORT]
        
        for action in actions:
            if user_can_perform_action(request.user, obj, action):
                permissions.append(action)
        
        return permissions

    def get_owner_username(self, obj):
        """Get the username of the document owner."""
        if obj.owner:
            return obj.owner.username
        return 'Unknown'

class DocumentListSerializer(serializers.ModelSerializer):
    """
    Lighter serializer for Document list view - excludes html/text for performance.
    """
    qr_code_url = serializers.SerializerMethodField()
    owner_username = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'qr_code', 'qr_code_url', 'created_at', 'updated_at',
            'owner_username'
        ]
        read_only_fields = ['id', 'qr_code', 'created_at', 'updated_at']

    def get_qr_code_url(self, obj):
        """Get the full URL for the QR code image."""
        if obj.qr_code:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.qr_code.url)
            return obj.qr_code.url
        return None

    def get_owner_username(self, obj):
        """Get the username of the document owner."""
        if obj.owner:
            return obj.owner.username
        return 'Unknown'


class DocumentCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating documents with automatic QR code generation.
    """
    file = serializers.FileField(required=False, allow_empty_file=False, write_only=True)
    class Meta:
        model = Document
        fields = ['title', 'html', 'file']
    
    def validate_file(self, value: UploadedFile) -> UploadedFile:
        """
        Validate the uploaded document file.
        
        Args:
            value: The uploaded file
            
        Returns:
            The validated file
            
        Raises:
            ValidationError: If file is invalid
        """
        # Check if file exists and has content
        if not value:
            raise serializers.ValidationError("No file was uploaded.")
        
        if not hasattr(value, 'name') or not value.name:
            raise serializers.ValidationError("File must have a valid filename.")
        
        # Validate file size
        file_size = value.size
        is_valid_size, size_error = validate_file_size(file_size)
        if not is_valid_size:
            raise serializers.ValidationError(size_error)
        
        # Additional validation for empty files
        if file_size == 0:
            raise serializers.ValidationError("The uploaded file is empty.")
        
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        html = validated_data.get('html', '')
        if html and BeautifulSoup:
            text = BeautifulSoup(html, 'html.parser').get_text("\n")
        elif html:
            import re
            text = re.sub('<[^<]+?>', '', html)
        else:
            text = ''
        document = Document.objects.create(
            title=validated_data.get('title'),
            html=html or None,
            text=text or None,
            owner=request.user if request and getattr(request, 'user', None) and request.user.is_authenticated else None,
        )
        return document

class QRCodeSerializer(serializers.Serializer):
    """
    Serializer for QR code responses.
    """
    qr_code_url = serializers.URLField(
        help_text="URL to access the QR code image"
    )
    document_url = serializers.URLField(
        help_text="URL that the QR code points to"
    )
    document_id = serializers.IntegerField(
        help_text="ID of the document"
    )
    document_title = serializers.CharField(
        help_text="Title of the document"
    )


# Group Serializers using Django's built-in Group model
class GroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Group
        fields = ['id', 'name', 'member_count']
        read_only_fields = ['id']
    
    def get_member_count(self, obj):
        return obj.user_set.count()


class UserGroupSerializer(serializers.Serializer):
    """Serializer for group membership information."""
    user_id = serializers.IntegerField(source='id')
    user_email = serializers.CharField(source='email', read_only=True)
    user_display_name = serializers.CharField(source='username', read_only=True)
    
    class Meta:
        fields = ['user_id', 'user_email', 'user_display_name']


class GroupMembershipSerializer(serializers.Serializer):
    """Serializer for adding/removing users from groups."""
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of user IDs to add/remove from the group"
    )


# ShareLink Serializers
class ShareLinkSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source='document.title', read_only=True)
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    is_expired = serializers.SerializerMethodField()
    is_revoked = serializers.SerializerMethodField()
    
    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'role', 'token', 'expires_at', 'revoked_at',
            'created_by', 'created_at', 'document_title', 'created_by_email',
            'is_expired', 'is_revoked'
        ]
        read_only_fields = ['id', 'token', 'created_by', 'created_at', 'revoked_at']
    
    def get_is_expired(self, obj):
        if not obj.expires_at:
            return False
        from django.utils import timezone
        return obj.expires_at < timezone.now()
    
    def get_is_revoked(self, obj):
        return obj.revoked_at is not None


class ShareLinkCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLink
        fields = ['role', 'expires_at']
    
    def create(self, validated_data):
        import secrets
        request = self.context.get('request')
        document = self.context.get('document')
        
        validated_data['token'] = secrets.token_urlsafe(32)
        validated_data['document'] = document
        validated_data['created_by'] = request.user if request and hasattr(request, 'user') else None
        
        return super().create(validated_data)


# Enhanced ACL Serializer
class ACLSerializer(serializers.ModelSerializer):
    subject_display_name = serializers.SerializerMethodField()
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    is_expired = serializers.SerializerMethodField()
    
    class Meta:
        model = ACL
        fields = [
            'id', 'document', 'subject_type', 'subject_id', 'role',
            'expires_at', 'created_by', 'created_at', 'subject_display_name',
            'created_by_email', 'is_expired'
        ]
        read_only_fields = ['id', 'created_by', 'created_at']
    
    def get_subject_display_name(self, obj):
        if obj.subject_type == 'user':
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user = User.objects.get(id=obj.subject_id)
                return user.email or user.username
            except:
                return f"User #{obj.subject_id}"
        elif obj.subject_type == 'group':
            try:
                group = Group.objects.get(id=obj.subject_id)
                return group.name
            except:
                return f"Group #{obj.subject_id}"
        elif obj.subject_type == 'share_link':
            try:
                share_link = ShareLink.objects.get(id=obj.subject_id)
                return f"Share Link ({share_link.role})"
            except:
                return f"Share Link #{obj.subject_id}"
        return obj.subject_id
    
    def get_is_expired(self, obj):
        if not obj.expires_at:
            return False
        from django.utils import timezone
        return obj.expires_at < timezone.now()


class DocumentVersionSerializer(serializers.ModelSerializer):
    """Serializer for document versions."""
    author_name = serializers.CharField(source='author.username', read_only=True)
    author_email = serializers.CharField(source='author.email', read_only=True)
    document_title = serializers.CharField(source='document.title', read_only=True)
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'document', 'version_no', 'html', 'text', 'author', 'author_name', 
            'author_email', 'change_note', 'hash', 'created_at', 'document_title'
        ]
        read_only_fields = ['id', 'created_at', 'hash']


class DocumentVersionListSerializer(serializers.ModelSerializer):
    """Simplified serializer for version lists (without full HTML content)."""
    author_name = serializers.CharField(source='author.username', read_only=True)
    author_email = serializers.CharField(source='author.email', read_only=True)
    content_preview = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_no', 'author', 'author_name', 'author_email', 
            'change_note', 'created_at', 'content_preview'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_content_preview(self, obj):
        """Return a preview of the content (first 200 chars of text)."""
        if obj.text:
            return obj.text[:200] + ('...' if len(obj.text) > 200 else '')
        return None


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for audit log entries."""
    actor_name = serializers.CharField(source='actor_user.username', read_only=True)
    actor_email = serializers.CharField(source='actor_user.email', read_only=True)
    document_title = serializers.CharField(source='document.title', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    share_link_token = serializers.CharField(source='share_link.token', read_only=True)
    qr_link_code = serializers.CharField(source='qr_link.code', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor_user', 'actor_name', 'actor_email', 'action', 'action_display',
            'document', 'document_title', 'version_no', 'ts', 'ip', 'user_agent', 
            'context', 'share_link', 'share_link_token', 'qr_link', 'qr_link_code'
        ]
        read_only_fields = ['id', 'ts']


class DocumentRestoreSerializer(serializers.Serializer):
    """Serializer for document version restoration."""
    version_id = serializers.UUIDField(help_text="ID of the version to restore to")
    change_note = serializers.CharField(
        max_length=500, 
        required=False, 
        help_text="Optional note about the restoration"
    )