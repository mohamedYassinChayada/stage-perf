"""
API views for OCR functionality and Document management with QR codes.
"""

import time
import logging
from rest_framework import status, generics
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from .models import Document, QRLink, ACL, Attachment, Label, Collection, DocumentLabel, DocumentCollection, ShareLink, DocumentVersion, AuditLog, Action, UserProfile, GroupOwnership, Notification, NotificationType, ApprovalStatus
from django.contrib.auth.models import Group
from .serializers import (
    OCRUploadSerializer, OCRResponseSerializer, OCRErrorSerializer,
    DocumentSerializer, DocumentListSerializer, DocumentCreateSerializer, QRCodeSerializer,
    GroupSerializer, UserGroupSerializer, GroupMembershipSerializer,
    ShareLinkSerializer, ShareLinkCreateSerializer, ACLSerializer,
    DocumentVersionSerializer, DocumentVersionListSerializer, AuditLogSerializer, DocumentRestoreSerializer
)
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login, logout
from rest_framework.authtoken.models import Token
from rest_framework.authentication import TokenAuthentication
from django.db.models import Q, F
from rest_framework.decorators import authentication_classes, permission_classes
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .audit import log_audit_event, log_document_view, log_document_edit, log_document_share, log_document_export, log_access_revoked
from django.contrib.postgres.search import SearchQuery, SearchRank
import re
import numpy as np
import cv2
from .permissions import DocumentAccessPermission, user_can_perform_action
from .utils.ocr import extract_text_from_file, get_ocr_info, extract_text_with_positions, extract_text_from_pdf_with_positions
from .utils.qrcode_generator import update_document_qr_code, get_qr_code_info

logger = logging.getLogger(__name__)

@swagger_auto_schema(
    method='post',
    operation_description="Extract text from uploaded image or PDF file using OCR",
    operation_summary="OCR Text Extraction",
    request_body=OCRUploadSerializer,
    responses={
        200: openapi.Response(
            description="OCR processing successful",
            schema=OCRResponseSerializer
        ),
        400: openapi.Response(
            description="Bad request - invalid file or validation error",
            schema=OCRErrorSerializer
        ),
        500: openapi.Response(
            description="Internal server error - OCR processing failed",
            schema=OCRErrorSerializer
        )
    },
    consumes=['multipart/form-data'],
    tags=['OCR']
)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def ocr_extract_text(request):
    """
    Extract text from uploaded image or PDF file using OCR.
    
    This endpoint accepts file uploads and returns the extracted text.
    The file is processed using EasyOCR engine with advanced image preprocessing
    for improved accuracy and better language support.
    
    **Supported file types:**
    - Images: PNG, JPEG, BMP, TIFF, WebP
    - Documents: PDF (converted to images for OCR)
    
    **File size limit:** 10MB
    
    **Returns:**
    - success: Boolean indicating if OCR was successful
    - extracted_text: The text content extracted from the file
    - filename: Original filename of the uploaded file
    - file_type: Type of file processed (image or pdf)
    - processing_time: Time taken for OCR processing
    - message: Additional information or error details
    """
    try:
        # Validate request data
        serializer = OCRUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            logger.warning(f"OCR upload validation failed: {serializer.errors}")
            return Response(
                {
                    "error": "Invalid file upload",
                    "error_code": "VALIDATION_ERROR",
                    "details": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the uploaded file
        uploaded_file = serializer.validated_data['file']
        filename = uploaded_file.name
        
        logger.info(f"Processing OCR for file: {filename}")
        
        # Read file content
        try:
            file_bytes = uploaded_file.read()
        except Exception as e:
            logger.error(f"Error reading uploaded file: {str(e)}")
            return Response(
                {
                    "error": "Failed to read uploaded file",
                    "error_code": "FILE_READ_ERROR",
                    "details": {"message": str(e)}
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Determine file type
        file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
        file_type = "pdf" if file_ext == "pdf" else "image"
        
        # Process OCR
        start_time = time.time()
        
        try:
            extracted_text, success = extract_text_from_file(file_bytes, filename)
            processing_time = time.time() - start_time
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"OCR processing failed for {filename}: {str(e)}")
            
            return Response(
                {
                    "error": "OCR processing failed",
                    "error_code": "OCR_PROCESSING_ERROR",
                    "details": {
                        "message": str(e),
                        "filename": filename,
                        "processing_time": processing_time
                    }
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Prepare response
        response_data = {
            "success": success,
            "extracted_text": extracted_text,
            "filename": filename,
            "file_type": file_type,
            "processing_time": round(processing_time, 2)
        }
        
        # Add message for unsuccessful processing
        if not success:
            response_data["message"] = "OCR processing completed but no text was extracted or an error occurred."
            logger.warning(f"OCR processing unsuccessful for {filename}: {extracted_text}")
        else:
            response_data["message"] = "OCR processing completed successfully."
            logger.info(f"OCR processing successful for {filename}. Extracted {len(extracted_text)} characters.")
        
        # Return appropriate status code
        response_status = status.HTTP_200_OK if success else status.HTTP_200_OK
        
        return Response(response_data, status=response_status)
        
    except Exception as e:
        logger.error(f"Unexpected error in OCR endpoint: {str(e)}")
        return Response(
            {
                "error": "Internal server error",
                "error_code": "INTERNAL_ERROR",
                "details": {"message": "An unexpected error occurred during processing"}
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@swagger_auto_schema(
    method='get',
    operation_description="Get information about the OCR endpoint",
    operation_summary="OCR Endpoint Information",
    responses={
        200: openapi.Response(
            description="Endpoint information",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'endpoint': openapi.Schema(type=openapi.TYPE_STRING),
                    'supported_formats': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(type=openapi.TYPE_STRING)
                    ),
                    'max_file_size': openapi.Schema(type=openapi.TYPE_STRING),
                    'description': openapi.Schema(type=openapi.TYPE_STRING),
                }
            )
        )
    },
    tags=['OCR']
)
@api_view(['GET'])
def ocr_info(request):
    """
    Get comprehensive information about the OCR system capabilities and configuration.
    """
    try:
        ocr_info_data = get_ocr_info()
        
        # Add endpoint specific information
        ocr_info_data.update({
            "endpoint": "/api/ocr/extract/",
            "description": "Upload images or PDF files to extract text using EasyOCR technology.",
            "features": [
                "Advanced neural network-based OCR",
                "Support for 80+ languages",
                "Image preprocessing for better accuracy",
                "PDF to image conversion",
                "Confidence scoring",
                "Error handling and validation"
            ],
            "usage": "Send a POST request with a 'file' parameter containing your image or PDF file."
        })
        
        return Response(ocr_info_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error getting OCR info: {str(e)}")
        return Response({
            "error": "Failed to get OCR information",
            "error_code": "INFO_ERROR",
            "details": {"message": str(e)}
                 }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@swagger_auto_schema(
    method='post',
    operation_description="Extract text with detailed positioning information from uploaded image or PDF file",
    operation_summary="OCR Text Extraction with Positioning",
    request_body=OCRUploadSerializer,
    responses={
        200: openapi.Response(
            description="OCR processing successful with positioning data",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'success': openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    'text': openapi.Schema(type=openapi.TYPE_STRING),
                    'lines': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(
                            type=openapi.TYPE_OBJECT,
                            properties={
                                'line_number': openapi.Schema(type=openapi.TYPE_INTEGER),
                                'text': openapi.Schema(type=openapi.TYPE_STRING),
                                'bbox': openapi.Schema(type=openapi.TYPE_OBJECT),
                                'confidence': openapi.Schema(type=openapi.TYPE_NUMBER)
                            }
                        )
                    ),
                    'blocks': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(type=openapi.TYPE_OBJECT)
                    ),
                    'image_size': openapi.Schema(type=openapi.TYPE_OBJECT),
                    'confidence': openapi.Schema(type=openapi.TYPE_NUMBER),
                    'filename': openapi.Schema(type=openapi.TYPE_STRING),
                    'file_type': openapi.Schema(type=openapi.TYPE_STRING),
                    'processing_time': openapi.Schema(type=openapi.TYPE_NUMBER)
                }
            )
        ),
        400: openapi.Response(
            description="Bad request - invalid file or validation error",
            schema=OCRErrorSerializer
        ),
        500: openapi.Response(
            description="Internal server error - OCR processing failed",
            schema=OCRErrorSerializer
        )
    },
    consumes=['multipart/form-data'],
    tags=['OCR']
)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def ocr_extract_detailed(request):
    """
    Extract text with detailed positioning information from uploaded image or PDF file.
    
    This endpoint provides enhanced OCR results including:
    - Text organized by lines with proper line breaks
    - Bounding box coordinates for each text block
    - Relative positioning information
    - Confidence scores per line and block
    - Image dimensions for coordinate reference
    
    **Supported file types:**
    - Images: PNG, JPEG, BMP, TIFF, WebP
    - Documents: PDF (converted to images for OCR)
    
    **File size limit:** 10MB
    
    **Returns detailed positioning data:**
    - lines: Array of text lines with positioning
    - blocks: Individual text blocks with coordinates
    - image_size: Original image dimensions
    - bbox: Bounding box coordinates for each element
    """
    try:
        # Validate request data
        serializer = OCRUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            logger.warning(f"OCR detailed upload validation failed: {serializer.errors}")
            return Response(
                {
                    "error": "Invalid file upload",
                    "error_code": "VALIDATION_ERROR",
                    "details": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the uploaded file
        uploaded_file = serializer.validated_data['file']
        filename = uploaded_file.name
        
        logger.info(f"Processing detailed OCR for file: {filename}")
        
        # Read file content
        try:
            file_bytes = uploaded_file.read()
        except Exception as e:
            logger.error(f"Error reading uploaded file: {str(e)}")
            return Response(
                {
                    "error": "Failed to read uploaded file",
                    "error_code": "FILE_READ_ERROR",
                    "details": {"message": str(e)}
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Determine file type
        file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
        file_type = "pdf" if file_ext == "pdf" else "image"
        
        # Process OCR with positioning
        start_time = time.time()
        
        try:
            if file_type == "image":
                detailed_result, success = extract_text_with_positions(file_bytes)
            else:
                # For PDFs, use FULL positioning extraction with all pages
                detailed_result, success = extract_text_from_pdf_with_positions(file_bytes)
            
            processing_time = time.time() - start_time
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Detailed OCR processing failed for {filename}: {str(e)}")
            
            return Response(
                {
                    "error": "OCR processing failed",
                    "error_code": "OCR_PROCESSING_ERROR",
                    "details": {
                        "message": str(e),
                        "filename": filename,
                        "processing_time": processing_time
                    }
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Prepare response
        response_data = {
            "success": success,
            "text": detailed_result.get("text", ""),
            "lines": detailed_result.get("lines", []),
            "blocks": detailed_result.get("blocks", []),
            "image_size": detailed_result.get("image_size", {}),
            "confidence": detailed_result.get("confidence", 0.0),
            "total_blocks": detailed_result.get("total_blocks", 0),
            "total_lines": detailed_result.get("total_lines", 0),
            "filename": filename,
            "file_type": file_type,
            "processing_time": round(processing_time, 2)
        }
        
        # Add PDF-specific metadata if available
        if "pdf_pages" in detailed_result:
            response_data["pdf_pages"] = detailed_result.get("pdf_pages", 0)
        
        # Add message
        if not success:
            response_data["message"] = "OCR processing completed but no text was extracted or an error occurred."
            logger.warning(f"Detailed OCR processing unsuccessful for {filename}")
        else:
            response_data["message"] = "OCR processing with positioning completed successfully."
            logger.info(f"Detailed OCR processing successful for {filename}. Extracted {len(detailed_result.get('text', ''))} characters in {detailed_result.get('total_lines', 0)} lines.")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Unexpected error in detailed OCR endpoint: {str(e)}")
        return Response(
            {
                "error": "Internal server error",
                "error_code": "INTERNAL_ERROR",
                "details": {"message": "An unexpected error occurred during processing"}
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

# Document Management Views

class DocumentListCreateView(generics.ListCreateAPIView):
    """
    List all documents or create a new document with automatic QR code generation.
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Short-circuit for schema generation (swagger)
        if getattr(self, 'swagger_fake_view', False):
            return Document.objects.none()
        user = self.request.user

        # Base queryset with select_related for owner
        base_qs = Document.objects.select_related('owner').prefetch_related('attachments')

        # Admin users see all documents, with optional owner filter
        if user.is_staff or user.is_superuser:
            qs = base_qs
            owner_filter = self.request.query_params.get('owner')
            if owner_filter:
                qs = qs.filter(owner__username__icontains=owner_filter)
            return qs.order_by('-created_at')

        # Get direct user ACLs
        user_acls = ACL.objects.filter(
            subject_type='user',
            subject_id=str(user.id)
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).values_list('document_id', flat=True)

        # Get group ACLs
        user_groups = user.groups.values_list('id', flat=True)
        group_acls = ACL.objects.filter(
            subject_type='group',
            subject_id__in=[str(group_id) for group_id in user_groups]
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).values_list('document_id', flat=True)

        # Combine owned documents with ACL-granted access
        return base_qs.filter(
            Q(owner=user) |
            Q(id__in=user_acls) |
            Q(id__in=group_acls)
        ).order_by('-created_at').distinct()
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DocumentCreateSerializer
        return DocumentListSerializer
    
    @swagger_auto_schema(
        operation_description="List all documents with their QR codes",
        operation_summary="List Documents",
        responses={
            200: openapi.Response(
                description="List of documents",
                schema=DocumentSerializer(many=True)
            )
        },
        tags=['Documents']
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
    
    @swagger_auto_schema(
        operation_description="Create a new document and automatically generate a QR code",
        operation_summary="Create Document with QR Code",
        request_body=DocumentCreateSerializer,
        responses={
            201: openapi.Response(
                description="Document created successfully with QR code",
                schema=DocumentSerializer
            ),
            400: openapi.Response(
                description="Bad request - validation error",
                schema=OCRErrorSerializer
            )
        },
        consumes=['multipart/form-data'],
        tags=['Documents']
    )
    def post(self, request, *args, **kwargs):
        """Create a new document with automatic QR code generation."""
        try:
            # Validate and create document
            create_serializer = DocumentCreateSerializer(data=request.data, context={'request': request})
            if not create_serializer.is_valid():
                return Response(
                    {
                        "error": "Invalid document data",
                        "error_code": "VALIDATION_ERROR",
                        "details": create_serializer.errors
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Save document with provided title/html (do not rely on filename for title)
            document = create_serializer.save()
            logger.info(f"Created new document: {document.title} (ID: {document.id})")
            
            # Create initial version
            DocumentVersion.objects.create(
                document=document,
                version_no=1,
                html=document.html,
                text=document.text,
                author=request.user,
                change_note="Initial document creation"
            )
            
            # Log document creation
            log_document_edit(request, document, version_no=1, changes={
                'action': 'document_create',
                'method': 'API_CREATE',
                'title': document.title
            })
            
            # Generate QR link (primary) to align with schema. Keep legacy QR image optional.
            try:
                # Create a simple unique code; in production use a secure token
                code = f"doc-{document.id}-{int(time.time())}"
                QRLink.objects.create(document=document, code=code, active=True, created_by=request.user if request.user and request.user.is_authenticated else None)
                # Optionally generate legacy QR image to not break existing UI
                try:
                    update_document_qr_code(document)
                    document.save()
                except Exception:
                    pass
                logger.info(f"Generated QR link for document {document.id}")
            except Exception as e:
                logger.error(f"Failed to generate QR link for document {document.id}: {str(e)}")
            
            # If a file is included, store as Attachment on Document
            upload = request.FILES.get('file') or request.data.get('file')
            if upload:
                try:
                    from django.core.files.base import ContentFile
                    data = upload.read()
                    Attachment.objects.create(
                        document=document,
                        version_no=None,
                        media_type=getattr(upload, 'content_type', 'application/octet-stream') or 'application/octet-stream',
                        filename=upload.name,
                        data=data,
                        metadata={}
                    )
                except Exception as e:
                    logger.warning(f"Could not create attachment: {e}")

            # Auto-assign "OCR" label for OCR-created documents
            is_ocr = request.data.get('is_ocr', '').lower() in ('true', '1', 'yes')
            if is_ocr:
                ocr_label, _ = Label.objects.get_or_create(name='OCR')
                DocumentLabel.objects.get_or_create(document=document, label=ocr_label)
                # Mark attachment as OCR source
                att = Attachment.objects.filter(document=document).order_by('-created_at').first()
                if att:
                    att.metadata = {'is_ocr_source': True}
                    att.save(update_fields=['metadata'])

            # Return document data
            response_serializer = DocumentSerializer(document, context={'request': request})
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating document: {str(e)}")
            return Response(
                {
                    "error": "Failed to create document",
                    "error_code": "CREATION_ERROR",
                    "details": {"message": str(e)}
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class DocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update, or delete a specific document.
    """
    permission_classes = [IsAuthenticated, DocumentAccessPermission]
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Document.objects.none()
        user = self.request.user
        
        # Admin users see all documents
        if user.is_staff or user.is_superuser:
            return Document.objects.all()
        
        # Get direct user ACLs
        user_acls = ACL.objects.filter(
            subject_type='user', 
            subject_id=str(user.id)
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).values_list('document_id', flat=True)
        
        # Get group ACLs
        user_groups = user.groups.values_list('id', flat=True)
        group_acls = ACL.objects.filter(
            subject_type='group',
            subject_id__in=[str(group_id) for group_id in user_groups]
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).values_list('document_id', flat=True)
        
        # Combine owned documents with ACL-granted access
        return Document.objects.filter(
            Q(owner=user) | 
            Q(id__in=user_acls) | 
            Q(id__in=group_acls)
        ).distinct()
    
    @swagger_auto_schema(
        operation_description="Retrieve a specific document with its QR code",
        operation_summary="Get Document",
        responses={
            200: openapi.Response(
                description="Document details",
                schema=DocumentSerializer
            ),
            404: openapi.Response(
                description="Document not found",
                schema=OCRErrorSerializer
            )
        },
        tags=['Documents']
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
    
    @swagger_auto_schema(
        operation_description="Update a document and regenerate QR code if needed",
        operation_summary="Update Document",
        request_body=DocumentCreateSerializer,
        responses={
            200: openapi.Response(
                description="Document updated successfully",
                schema=DocumentSerializer
            ),
            400: openapi.Response(
                description="Bad request - validation error",
                schema=OCRErrorSerializer
            ),
            404: openapi.Response(
                description="Document not found",
                schema=OCRErrorSerializer
            )
        },
        tags=['Documents']
    )
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)
    
    def get(self, request, *args, **kwargs):
        """Override get to add audit logging."""
        response = super().get(request, *args, **kwargs)
        if response.status_code == 200:
            document = self.get_object()
            log_document_view(request, document)
        return response
    
    def perform_update(self, serializer):
        """Override to add audit logging and version tracking."""
        document = self.get_object()
        old_html = document.html
        old_title = document.title

        # Save the updated document
        updated_document = serializer.save()

        # Create new version if content changed
        if old_html != updated_document.html:
            new_version_no = updated_document.current_version_no + 1
            DocumentVersion.objects.create(
                document=updated_document,
                version_no=new_version_no,
                html=updated_document.html,
                text=updated_document.text,
                author=self.request.user,
                change_note=f"Document updated via API"
            )
            updated_document.current_version_no = new_version_no
            updated_document.save()

            # Log the edit
            log_document_edit(self.request, updated_document, version_no=new_version_no, changes={
                'title_changed': old_title != updated_document.title,
                'content_changed': True,
                'method': 'API_UPDATE'
            })

            # Notify document owner
            try:
                from .utils.notifications import notify_document_edited
                notify_document_edited(updated_document, self.request.user)
            except Exception:
                pass
    
    @swagger_auto_schema(
        operation_description="Delete a document and its associated files",
        operation_summary="Delete Document",
        responses={
            204: openapi.Response(description="Document deleted successfully"),
            404: openapi.Response(
                description="Document not found",
                schema=OCRErrorSerializer
            )
        },
        tags=['Documents']
    )
    def delete(self, request, *args, **kwargs):
        document = self.get_object()
        try:
            from .utils.notifications import notify_document_deleted
            notify_document_deleted(document, request.user)
        except Exception:
            pass
        return super().delete(request, *args, **kwargs)

@swagger_auto_schema(
    method='get',
    operation_description="Retrieve the QR code image for a specific document",
    operation_summary="Get Document QR Code",
    responses={
        200: openapi.Response(
            description="QR code image",
            schema=openapi.Schema(
                type=openapi.TYPE_STRING,
                format=openapi.FORMAT_BINARY
            )
        ),
        404: openapi.Response(
            description="Document or QR code not found",
            schema=OCRErrorSerializer
        )
    },
    produces=['image/png'],
    tags=['Documents', 'QR Codes']
)
@api_view(['GET'])
def document_qr_code(request, pk):
    """
    Retrieve the QR code image for a specific document.
    
    Returns the QR code as a PNG image that can be displayed or downloaded.
    The QR code contains a URL pointing to the document.
    """
    try:
        document = get_object_or_404(Document, pk=pk)

        if not document.qr_code_data:
            return Response(
                {
                    "error": "QR code not found for this document",
                    "error_code": "QR_CODE_NOT_FOUND",
                    "details": {"document_id": pk}
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # Return the QR code image from database binary data
        response = HttpResponse(bytes(document.qr_code_data), content_type='image/png')
        response['Content-Disposition'] = f'inline; filename="document_{pk}_qr.png"'
        return response
            
    except Exception as e:
        logger.error(f"Error retrieving QR code for document {pk}: {str(e)}")
        return Response(
            {
                "error": "Failed to retrieve QR code",
                "error_code": "QR_CODE_RETRIEVAL_ERROR",
                "details": {"message": str(e)}
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@swagger_auto_schema(
    method='get',
    operation_description="Resolve a QR code to a document if active and not expired",
    operation_summary="Resolve QR",
    responses={
        200: openapi.Response(
            description="Resolved successfully",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'document_id': openapi.Schema(type=openapi.TYPE_INTEGER),
                    'version_no': openapi.Schema(type=openapi.TYPE_INTEGER),
                }
            )
        ),
        404: openapi.Response(description="QR not found or inactive"),
        410: openapi.Response(description="QR expired"),
    },
    tags=['QR Codes']
)
@api_view(['GET'])
def resolve_qr(request, code: str):
    try:
        qr = QRLink.objects.filter(code=code).first()
        if not qr or not qr.active:
            return Response({"error": "QR code not found"}, status=status.HTTP_404_NOT_FOUND)
        if qr.expires_at:
            from django.utils import timezone
            if qr.expires_at < timezone.now():
                return Response({"error": "QR code expired"}, status=status.HTTP_410_GONE)
        return Response({"document_id": qr.document_id, "version_no": qr.version_no}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"QR resolve error: {str(e)}")
        return Response({"error": "Failed to resolve"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- Auth & User endpoints ---
@swagger_auto_schema(
    method='post',
    operation_description="Register a new user",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'username': openapi.Schema(type=openapi.TYPE_STRING),
            'password': openapi.Schema(type=openapi.TYPE_STRING, format=openapi.FORMAT_PASSWORD),
            'email': openapi.Schema(type=openapi.TYPE_STRING),
        },
        required=['username','password']
    ),
    tags=['Auth']
)
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@csrf_exempt
def register(request):
    from django.contrib.auth.models import User
    from .utils.email_service import generate_verification_code, send_verification_email
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email')
    if not username or not password:
        return Response({'error': 'username and password are required'}, status=400)
    if not email:
        return Response({'error': 'email is required'}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({'error': 'username already exists'}, status=400)
    if User.objects.filter(email=email).exists():
        return Response({'error': 'email already exists'}, status=400)
    user = User.objects.create_user(username=username, password=password, email=email)
    token, _ = Token.objects.get_or_create(user=user)

    # Create profile with pending verification
    code = generate_verification_code()
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.approval_status = ApprovalStatus.PENDING_VERIFICATION
    profile.email_verified = False
    profile.email_verification_code = code
    profile.email_verification_expires = timezone.now() + timezone.timedelta(minutes=15)
    profile.save()

    # Send verification email
    send_verification_email(user, code)

    # Notify admins of new registration
    try:
        from .utils.notifications import notify_new_registration
        notify_new_registration(user)
    except Exception:
        pass

    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'token': token.key,
        'needs_verification': True,
        'approval_status': profile.approval_status,
    }, status=201)


@swagger_auto_schema(
    method='get',
    operation_description="Get current authenticated user",
    tags=['Auth']
)
@api_view(['GET'])
@permission_classes([AllowAny])
def me(request):
    if not request.user or not request.user.is_authenticated:
        return Response({'authenticated': False}, status=200)
    avatar_url = None
    email_verified = True
    approval_status = 'approved'
    try:
        profile = request.user.profile
        if profile.avatar:
            avatar_url = profile.avatar
        email_verified = profile.email_verified
        approval_status = profile.approval_status
    except UserProfile.DoesNotExist:
        pass
    return Response({
        'authenticated': True,
        'id': request.user.id,
        'username': request.user.username,
        'email': request.user.email,
        'avatar_url': avatar_url,
        'is_admin': request.user.is_superuser,
        'email_verified': email_verified,
        'approval_status': approval_status,
    }, status=200)


@swagger_auto_schema(
    method='post',
    tags=['Auth'],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'username': openapi.Schema(type=openapi.TYPE_STRING),
            'password': openapi.Schema(type=openapi.TYPE_STRING, format=openapi.FORMAT_PASSWORD),
        },
        required=['username','password']
    ))
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@csrf_exempt
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'invalid credentials'}, status=400)
    login(request, user)
    token, _ = Token.objects.get_or_create(user=user)
    approval_status = 'approved'
    try:
        approval_status = user.profile.approval_status
    except UserProfile.DoesNotExist:
        pass
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'token': token.key,
        'approval_status': approval_status,
        'is_active': user.is_active,
    }, status=200)


@swagger_auto_schema(method='post', tags=['Auth'])
@api_view(['POST'])
def logout_view(request):
    if request.user and request.user.is_authenticated:
        try:
            Token.objects.filter(user=request.user).delete()
        except Exception:
            pass
        logout(request)
    return Response({'ok': True}, status=200)


@swagger_auto_schema(
    method='post',
    operation_description="Verify email with 6-digit code",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'code': openapi.Schema(type=openapi.TYPE_STRING),
        },
        required=['code']
    ),
    tags=['Auth']
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_email(request):
    code = request.data.get('code')
    if not code:
        return Response({'error': 'code is required'}, status=400)
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'profile not found'}, status=404)

    if profile.email_verified:
        return Response({'error': 'email already verified'}, status=400)

    if profile.email_verification_code != code:
        return Response({'error': 'invalid verification code'}, status=400)

    if profile.email_verification_expires and timezone.now() > profile.email_verification_expires:
        return Response({'error': 'verification code has expired'}, status=400)

    profile.email_verified = True
    profile.approval_status = ApprovalStatus.PENDING_APPROVAL
    profile.email_verification_code = None
    profile.email_verification_expires = None
    profile.save()

    # Notify admins
    try:
        from .utils.notifications import notify_email_verified
        notify_email_verified(request.user)
    except Exception:
        pass

    return Response({
        'message': 'Email verified successfully',
        'approval_status': profile.approval_status,
    }, status=200)


@swagger_auto_schema(
    method='post',
    operation_description="Resend email verification code",
    tags=['Auth']
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def resend_verification(request):
    from .utils.email_service import generate_verification_code, send_verification_email
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'profile not found'}, status=404)

    if profile.email_verified:
        return Response({'error': 'email already verified'}, status=400)

    if not request.user.email:
        return Response({'error': 'no email address on account'}, status=400)

    code = generate_verification_code()
    profile.email_verification_code = code
    profile.email_verification_expires = timezone.now() + timezone.timedelta(minutes=15)
    profile.save(update_fields=['email_verification_code', 'email_verification_expires'])

    send_verification_email(request.user, code)
    return Response({'message': 'Verification code resent'}, status=200)


@swagger_auto_schema(method='get', tags=['Auth'])
@api_view(['GET'])
def list_users(request):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    users = User.objects.all().values('id', 'username', 'email')
    return Response(list(users), status=200)


@swagger_auto_schema(
    method='get',
    operation_description="Get current user profile",
    tags=['Auth']
)
@swagger_auto_schema(
    method='put',
    operation_description="Update user profile (email)",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'email': openapi.Schema(type=openapi.TYPE_STRING),
        }
    ),
    tags=['Auth']
)
@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """Get or update user profile."""
    user = request.user
    avatar_url = None
    try:
        profile = user.profile
        if profile.avatar:
            avatar_url = request.build_absolute_uri(profile.avatar.url)
    except UserProfile.DoesNotExist:
        pass

    if request.method == 'GET':
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'avatar_url': avatar_url,
        })

    elif request.method == 'PUT':
        email = request.data.get('email')
        if email is not None:
            user.email = email
            user.save(update_fields=['email'])
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'avatar_url': avatar_url,
            'message': 'Profile updated successfully'
        })


@swagger_auto_schema(
    method='post',
    operation_description="Change user password",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'current_password': openapi.Schema(type=openapi.TYPE_STRING),
            'new_password': openapi.Schema(type=openapi.TYPE_STRING),
        },
        required=['current_password', 'new_password']
    ),
    tags=['Auth']
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change the current user's password."""
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return Response({'error': 'current_password and new_password are required'}, status=400)

    if not request.user.check_password(current_password):
        return Response({'error': 'Current password is incorrect'}, status=400)

    if len(new_password) < 4:
        return Response({'error': 'New password must be at least 4 characters'}, status=400)

    request.user.set_password(new_password)
    request.user.save()

    # Regenerate token
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)

    return Response({
        'message': 'Password changed successfully',
        'token': token.key
    })


@swagger_auto_schema(
    method='post',
    operation_description="Upload user avatar",
    tags=['Auth']
)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def upload_avatar(request):
    """Upload or update user avatar."""
    import base64
    if 'avatar' not in request.FILES:
        return Response({'error': 'No avatar file provided'}, status=400)

    avatar_file = request.FILES['avatar']

    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if avatar_file.content_type not in allowed_types:
        return Response({'error': 'Invalid file type. Use JPEG, PNG, GIF, or WebP.'}, status=400)

    # Validate file size (max 2MB)
    if avatar_file.size > 2 * 1024 * 1024:
        return Response({'error': 'File too large. Maximum size is 2MB.'}, status=400)

    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    # Store as base64 data URI in the database
    file_data = avatar_file.read()
    b64 = base64.b64encode(file_data).decode('utf-8')
    avatar_url = f"data:{avatar_file.content_type};base64,{b64}"
    profile.avatar = avatar_url
    profile.save()

    return Response({
        'message': 'Avatar uploaded successfully',
        'avatar_url': avatar_url
    })


# --- ACL / Sharing ---
@swagger_auto_schema(
    method='post',
    operation_description="Share document with a user or group by granting ACL permissions.",
    operation_summary="Share Document with User or Group",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'subject_type': openapi.Schema(type=openapi.TYPE_STRING, description="Type of subject ('user' or 'group')"),
            'subject_id': openapi.Schema(type=openapi.TYPE_STRING, description="ID of the user or group"),
            'role': openapi.Schema(type=openapi.TYPE_STRING, description="Role to assign (VIEWER, EDITOR, OWNER)"),
            'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format=openapi.FORMAT_DATETIME, description="Optional expiry date"),
        },
        required=['subject_type', 'subject_id', 'role'],
    ),
    responses={
        201: openapi.Response(description="Share created successfully"),
        400: "Bad request - missing or invalid parameters",
        403: "Forbidden - user cannot share this document",
        404: "Document not found",
    },
    tags=['Sharing']
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def document_share_create(request, pk: int):
    document = get_object_or_404(Document, pk=pk)
    
    # Check if user can share this document using enhanced permissions
    from .permissions import user_can_perform_action, Action
    if not user_can_perform_action(request.user, document, Action.SHARE):
        return Response({'error': 'You do not have permission to share this document'}, status=403)
    
    subject_type = request.data.get('subject_type') or request.data.get('subjectType')
    subject_id = request.data.get('subject_id') or request.data.get('subjectId')
    role = request.data.get('role', 'VIEWER')
    expires_at = request.data.get('expires_at')
    
    if not all([subject_type, subject_id, role]):
        return Response({'error': 'subject_type, subject_id, and role are required'}, status=400)
    
    # Validate subject exists
    if subject_type == 'user':
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            User.objects.get(id=subject_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=400)
    elif subject_type == 'group':
        try:
            Group.objects.get(id=subject_id)
        except Group.DoesNotExist:
            return Response({'error': 'Group not found'}, status=400)
    else:
        return Response({'error': 'subject_type must be "user" or "group"'}, status=400)
    
    try:
        # Create or update ACL entry
        acl, created = ACL.objects.update_or_create(
            document=document,
            subject_type=subject_type,
            subject_id=str(subject_id),
            defaults={
                'role': role,
                'expires_at': expires_at,
                'created_by': request.user
            }
        )
        
        # Log the sharing action
        shared_with_name = None
        if subject_type == 'user':
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user = User.objects.get(id=subject_id)
                shared_with_name = user.email or user.username
            except:
                shared_with_name = f"User #{subject_id}"
        elif subject_type == 'group':
            try:
                group = Group.objects.get(id=subject_id)
                shared_with_name = group.name
            except:
                shared_with_name = f"Group #{subject_id}"
        
        log_document_share(request, document, shared_with=shared_with_name, role=role)

        try:
            from .utils.notifications import notify_acl_granted
            notify_acl_granted(acl, request.user)
        except Exception:
            pass

        return Response({
            'id': str(acl.id),
            'message': 'Document shared successfully',
            'created': created
        }, status=201)
    except Exception as e:
        return Response({'error': str(e)}, status=400)


@swagger_auto_schema(method='get', tags=['Sharing'])
@api_view(['GET'])
def document_shares_list(request, pk: int):
    if not request.user or not request.user.is_authenticated:
        return Response({'error': 'auth required'}, status=401)
    document = get_object_or_404(Document, pk=pk)
    if document.owner_id != request.user.id and not (request.user.is_staff or request.user.is_superuser):
        return Response({'error': 'forbidden'}, status=403)
    items = ACL.objects.filter(document=document).values('id', 'subject_type', 'subject_id', 'role', 'expires_at', 'created_at')
    # Attach username if subject_type is user
    from django.contrib.auth import get_user_model
    User = get_user_model()
    result = []
    for it in items:
        username = None
        if it['subject_type'] == 'user':
            try:
                user = User.objects.filter(id=it['subject_id']).first()
                if user:
                    username = user.username
            except Exception:
                username = None
        it['username'] = username
        result.append(it)
    return Response(result, status=200)


@swagger_auto_schema(
    method='put',
    operation_description="Update an ACL entry's role",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'role': openapi.Schema(type=openapi.TYPE_STRING, description="New role (VIEWER, EDITOR, OWNER)"),
        },
        required=['role']
    ),
    tags=['Sharing']
)
@swagger_auto_schema(method='delete', tags=['Sharing'])
@api_view(['PUT', 'DELETE'])
def share_update_delete(request, share_id: str):
    if not request.user or not request.user.is_authenticated:
        return Response({'error': 'auth required'}, status=401)
    acl = get_object_or_404(ACL, id=share_id)
    document = acl.document
    if document.owner_id != request.user.id and not (request.user.is_staff or request.user.is_superuser):
        return Response({'error': 'forbidden'}, status=403)

    if request.method == 'DELETE':
        try:
            from .utils.notifications import notify_acl_revoked
            notify_acl_revoked(acl, request.user)
        except Exception:
            pass
        log_access_revoked(request, document, revoked_from=f"{acl.subject_type}:{acl.subject_id}")
        acl.delete()
        return Response(status=204)

    elif request.method == 'PUT':
        role = request.data.get('role')
        valid_roles = ['VIEWER', 'EDITOR', 'OWNER']
        if role not in valid_roles:
            return Response({'error': f'role must be one of {valid_roles}'}, status=400)
        old_role = acl.role
        acl.role = role
        acl.save(update_fields=['role'])
        if old_role != role:
            try:
                from .utils.notifications import notify_acl_changed
                notify_acl_changed(acl, old_role, role, request.user)
            except Exception:
                pass
        return Response({
            'id': str(acl.id),
            'role': acl.role,
            'message': 'Role updated successfully'
        })


# --- Labels ---
@swagger_auto_schema(method='get', tags=['Labels'])
@api_view(['GET'])
def labels_list(request):
    items = Label.objects.all().values('id', 'name')
    # Convert UUID to string for JSON serialization
    result = [{'id': str(item['id']), 'name': item['name']} for item in items]
    return Response(result, status=200)


@swagger_auto_schema(method='post', tags=['Labels'])
@api_view(['POST'])
def label_create(request):
    name = request.data.get('name')
    if not name:
        return Response({'error': 'name required'}, status=400)
    lb = Label.objects.create(name=name)
    return Response({'id': str(lb.id), 'name': lb.name}, status=201)


@swagger_auto_schema(method='post', tags=['Labels'])
@api_view(['POST'])
def document_set_labels(request, pk: int):
    doc = get_object_or_404(Document, pk=pk)
    ids = request.data.get('label_ids') or []
    try:
        DocumentLabel.objects.filter(document=doc).delete()
        for lid in ids:
            # Validate that the label exists before creating the association
            label = get_object_or_404(Label, id=lid)
            DocumentLabel.objects.create(document=doc, label=label)
        return Response({'ok': True}, status=200)
    except Exception as e:
        return Response({'error': str(e)}, status=400)


# --- Collections ---
@swagger_auto_schema(method='get', tags=['Collections'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def collections_list(request):
    items = Collection.objects.filter(owner=request.user).values('id', 'name', 'parent_id')
    return Response(list(items), status=200)


@swagger_auto_schema(method='post', tags=['Collections'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def collection_create(request):
    name = request.data.get('name')
    parent_id = request.data.get('parent_id')
    if not name:
        return Response({'error': 'name required'}, status=400)
    if parent_id:
        parent = Collection.objects.filter(id=parent_id, owner=request.user).first()
        if not parent:
            return Response({'error': 'Parent collection not found or not owned by you'}, status=403)
    coll = Collection.objects.create(name=name, parent_id=parent_id or None, owner=request.user)
    return Response({'id': str(coll.id), 'name': coll.name, 'parent_id': coll.parent_id}, status=201)


@swagger_auto_schema(
    method='delete',
    operation_description="Delete a collection and all its sub-collections. Documents are NOT deleted, only the collection associations.",
    operation_summary="Delete Collection",
    responses={
        204: "Collection deleted successfully",
        403: "Permission denied - only collection owner can delete",
        404: "Collection not found",
        400: "Bad request"
    },
    tags=['Collections']
)
@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def collection_delete(request, collection_id):
    """Delete a collection and all its sub-collections."""
    try:
        collection = get_object_or_404(Collection, id=collection_id)
        
        # Check permissions - only owner or admin can delete
        if collection.owner != request.user and not (request.user.is_staff or request.user.is_superuser):
            return Response({'error': 'Only the collection owner can delete this collection'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get collection name for logging
        collection_name = collection.name
        
        # Count sub-collections that will be deleted (for confirmation)
        def count_descendants(coll):
            count = 1  # Count the collection itself
            for child in coll.children.all():
                count += count_descendants(child)
            return count
        
        total_collections_to_delete = count_descendants(collection)
        
        # Count documents that will be unlinked (but not deleted)
        documents_to_unlink = set()
        
        def collect_document_ids(coll):
            # Get documents directly in this collection
            doc_ids = DocumentCollection.objects.filter(collection=coll).values_list('document_id', flat=True)
            documents_to_unlink.update(doc_ids)
            
            # Recursively collect from children
            for child in coll.children.all():
                collect_document_ids(child)
        
        collect_document_ids(collection)
        
        # Log the deletion action before deleting
        log_audit_event(
            action=Action.SHARE,  # Using SHARE as closest action, could add DELETE action
            request=request,
            context={
                'collection_deleted': True,
                'collection_name': collection_name,
                'collections_count': total_collections_to_delete,
                'documents_unlinked': len(documents_to_unlink)
            }
        )
        
        # Delete the collection (CASCADE will delete all children and DocumentCollection entries)
        # Documents themselves are NOT deleted due to the model relationship setup
        collection.delete()
        
        return Response({
            'message': f'Collection "{collection_name}" and {total_collections_to_delete - 1} sub-collections deleted successfully',
            'collections_deleted': total_collections_to_delete,
            'documents_unlinked': len(documents_to_unlink)
        }, status=status.HTTP_204_NO_CONTENT)
        
    except Exception as e:
        logger.error(f"Error deleting collection {collection_id}: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='put',
    operation_description="Rename a collection. Only the owner can rename.",
    operation_summary="Update Collection",
    responses={
        200: "Collection updated successfully",
        403: "Permission denied - only collection owner can update",
        404: "Collection not found",
        400: "Bad request"
    },
    tags=['Collections']
)
@api_view(['PUT'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def collection_update(request, collection_id):
    """Update (rename) a collection."""
    try:
        collection = get_object_or_404(Collection, id=collection_id)

        if collection.owner != request.user and not (request.user.is_staff or request.user.is_superuser):
            return Response({'error': 'Only the collection owner can update this collection'}, status=status.HTTP_403_FORBIDDEN)

        name = request.data.get('name')
        if not name or not name.strip():
            return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        collection.name = name.strip()
        collection.save()

        return Response({
            'id': str(collection.id),
            'name': collection.name,
            'parent_id': str(collection.parent_id) if collection.parent_id else None,
        })

    except Exception as e:
        logger.error(f"Error updating collection {collection_id}: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='get',
    operation_description="Get detailed information about a collection including document count",
    operation_summary="Get Collection Details",
    responses={200: "Collection details"},
    tags=['Collections']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def collection_detail(request, collection_id):
    """Get detailed collection information."""
    try:
        collection = get_object_or_404(Collection, id=collection_id)

        if collection.owner != request.user and not (request.user.is_staff or request.user.is_superuser):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        # Count documents in this collection
        document_count = DocumentCollection.objects.filter(collection=collection).count()
        
        # Count sub-collections
        def count_descendants(coll):
            count = 0
            for child in coll.children.all():
                count += 1 + count_descendants(child)
            return count
        
        subcollection_count = count_descendants(collection)
        
        return Response({
            'id': str(collection.id),
            'name': collection.name,
            'parent_id': str(collection.parent_id) if collection.parent_id else None,
            'owner_id': collection.owner_id,
            'created_at': collection.created_at,
            'document_count': document_count,
            'subcollection_count': subcollection_count
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(method='post', tags=['Collections'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_set_collections(request, pk: int):
    doc = get_object_or_404(Document, pk=pk)
    ids = request.data.get('collection_ids') or []
    try:
        # Validate all collection IDs belong to the requesting user
        if ids:
            owned_count = Collection.objects.filter(id__in=ids, owner=request.user).count()
            if owned_count != len(ids):
                return Response({'error': 'One or more collections do not belong to you'}, status=status.HTTP_403_FORBIDDEN)
        DocumentCollection.objects.filter(document=doc).delete()
        for cid in ids:
            DocumentCollection.objects.create(document=doc, collection_id=cid)
        return Response({'ok': True}, status=200)
    except Exception as e:
        return Response({'error': str(e)}, status=400)


# --- Search ---
def _permission_filter_queryset(request):
    user = request.user
    if not user or not user.is_authenticated:
        return Document.objects.none()
    
    # Admin users see all documents
    if user.is_staff or user.is_superuser:
        return Document.objects.all()
    
    # Get direct user ACLs
    user_acls = ACL.objects.filter(
        subject_type='user', 
        subject_id=str(user.id)
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    ).values_list('document_id', flat=True)
    
    # Get group ACLs
    user_groups = user.groups.values_list('id', flat=True)
    group_acls = ACL.objects.filter(
        subject_type='group',
        subject_id__in=[str(group_id) for group_id in user_groups]
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    ).values_list('document_id', flat=True)
    
    # Combine owned documents with ACL-granted access
    return Document.objects.filter(
        Q(owner=user) | 
        Q(id__in=user_acls) | 
        Q(id__in=group_acls)
    ).distinct()


@swagger_auto_schema(
    method='get',
    tags=['Search'],
    manual_parameters=[
        openapi.Parameter('q', openapi.IN_QUERY, description='Title contains (standard search)', type=openapi.TYPE_STRING),
        openapi.Parameter('label_ids', openapi.IN_QUERY, description='Filter by label id (repeatable)', type=openapi.TYPE_ARRAY, items=openapi.Items(type=openapi.TYPE_STRING))
    ]
)
@api_view(['GET'])
def search_standard(request):
    qs = _permission_filter_queryset(request)
    q = request.GET.get('q', '').strip()
    label_ids = request.GET.getlist('label_ids') or request.GET.get('label_ids', '')
    if isinstance(label_ids, str) and label_ids:
        label_ids = [x for x in re.split(r'[ ,]+', label_ids) if x]
    if q:
        qs = qs.filter(title__icontains=q)
    if label_ids:
        qs = qs.filter(documentlabel__label_id__in=label_ids).distinct()
    # Optimize with select_related and use lighter serializer
    qs = qs.select_related('owner').prefetch_related('attachments').order_by('-updated_at')[:50]  # Limit results
    data = DocumentListSerializer(qs, many=True, context={'request': request}).data
    return Response(data, status=200)


@swagger_auto_schema(
    method='get',
    tags=['Search'],
    manual_parameters=[
        openapi.Parameter('q', openapi.IN_QUERY, description='Deep search query (full-text)', type=openapi.TYPE_STRING, required=True)
    ]
)
@api_view(['GET'])
def search_deep(request):
    qs = _permission_filter_queryset(request)
    q = request.GET.get('q', '').strip()
    if not q:
        return Response({'error': 'q required'}, status=400)
    try:
        from django.db import connection
        if connection.vendor == 'postgresql':
            try:
                query = SearchQuery(q, config='english')
                qs2 = qs.filter(search_tsv__search=query)
                if not qs2.exists():
                    qs2 = qs.filter(search_tsv__search=q)
                qs = qs2.order_by('-updated_at')
            except Exception as e:
                logger.warning(f"FTS search fallback due to error: {e}")
                qs = qs.filter(text__icontains=q).order_by('-updated_at')
        else:
            qs = qs.filter(text__icontains=q).order_by('-updated_at')
    except Exception as e:
        logger.error(f"Deep search error: {e}")
        qs = qs.filter(text__icontains=q).order_by('-updated_at')
    # Optimize and limit results
    qs = qs.select_related('owner').prefetch_related('attachments')[:50]
    data = DocumentListSerializer(qs, many=True, context={'request': request}).data
    return Response(data, status=200)


@swagger_auto_schema(method='post', tags=['Search'])
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def search_qr(request):
    if 'file' not in request.FILES:
        return Response({'error': 'file required'}, status=400)
    f = request.FILES['file']
    try:
        data = np.frombuffer(f.read(), np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        detector = cv2.QRCodeDetector()
        val, points, _ = detector.detectAndDecode(img)
        if not val:
            return Response({'error': 'QR not detected'}, status=400)
        code = val
        m = re.search(r"/qr/resolve/([^/]+)/?", val)
        if m:
            code = m.group(1)
        qr = QRLink.objects.filter(code=code, active=True).first()
        if not qr:
            return Response({'error': 'QR not found'}, status=404)
        # Permission check
        doc_qs = _permission_filter_queryset(request).filter(id=qr.document_id)
        if not doc_qs.exists():
            return Response({'error': 'forbidden'}, status=403)
        data = DocumentSerializer(doc_qs.first(), context={'request': request}).data
        return Response({'document': data}, status=200)
    except Exception as e:
        logger.error(f"QR search error: {e}")
        return Response({'error': 'failed to process QR'}, status=500)

@swagger_auto_schema(
    method='get',
    operation_description="Get information about QR code generation capabilities",
    operation_summary="QR Code System Information",
    responses={
        200: openapi.Response(
            description="QR code system information",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'qr_code_generator': openapi.Schema(type=openapi.TYPE_STRING),
                    'supported_formats': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(type=openapi.TYPE_STRING)
                    ),
                    'default_size': openapi.Schema(type=openapi.TYPE_STRING),
                    'features': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(type=openapi.TYPE_STRING)
                    )
                }
            )
        )
    },
    tags=['QR Codes']
)
@api_view(['GET'])
def qr_code_info(request):
    """
    Get information about the QR code generation system.
    """
    try:
        qr_info = get_qr_code_info()
        return Response(qr_info, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting QR code info: {str(e)}")
        return Response(
            {
                "error": "Failed to get QR code information",
                "error_code": "QR_INFO_ERROR",
                "details": {"message": str(e)}
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def attachment_download(request, attachment_id):
    att = get_object_or_404(Attachment, id=attachment_id)
    try:
        # Return binary data stored in DB as file
        response = HttpResponse(bytes(att.data), content_type=att.media_type or 'application/octet-stream')
        response['Content-Disposition'] = f'inline; filename="{att.filename}"'
        return response
    except Exception as e:
        logger.error(f"Attachment download error: {e}")
        return Response({'error': 'failed to download'}, status=500)


# ============ GROUP MANAGEMENT ENDPOINTS ============

@swagger_auto_schema(
    method='get',
    operation_description="List all groups the user has access to",
    operation_summary="List Groups",
    responses={200: GroupSerializer(many=True)},
    tags=['Groups']
)
@swagger_auto_schema(
    method='post',
    operation_description="Create a new group",
    operation_summary="Create Group",
    request_body=GroupSerializer,
    responses={201: GroupSerializer, 400: "Bad request"},
    tags=['Groups']
)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def groups_list_create(request):
    """List all groups or create a new group."""
    if request.method == 'GET':
        # All users (including admin) see only groups they belong to
        groups = request.user.groups.all()

        serializer = GroupSerializer(groups, many=True, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = GroupSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            group = serializer.save()
            # Add creator as a member
            request.user.groups.add(group)
            # Track group ownership
            GroupOwnership.objects.create(group=group, owner=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='get',
    operation_description="Get group details",
    operation_summary="Get Group",
    responses={200: GroupSerializer},
    tags=['Groups']
)
@swagger_auto_schema(
    method='put',
    operation_description="Update group details",
    operation_summary="Update Group",
    request_body=GroupSerializer,
    responses={200: GroupSerializer},
    tags=['Groups']
)
@swagger_auto_schema(
    method='delete',
    operation_description="Delete group",
    operation_summary="Delete Group",
    responses={204: "No content"},
    tags=['Groups']
)
@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def group_detail(request, group_id):
    """Get, update, or delete a group."""
    group = get_object_or_404(Group, id=group_id)
    
    # Check if user has access to this group
    is_member = request.user.groups.filter(id=group_id).exists()
    
    if not (is_member or request.user.is_staff):
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        serializer = GroupSerializer(group, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'PUT':
        # Allow group members to update group details, not just staff
        if not (is_member or request.user.is_staff):
            return Response({'error': 'Only group members or staff can update groups'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = GroupSerializer(group, data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        # Only staff can delete groups (this is more restrictive for safety)
        if not request.user.is_staff:
            return Response({'error': 'Only staff can delete groups'}, status=status.HTTP_403_FORBIDDEN)
        
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@swagger_auto_schema(
    method='get',
    operation_description="List group members",
    operation_summary="List Group Members",
    responses={200: UserGroupSerializer(many=True)},
    tags=['Groups']
)
@swagger_auto_schema(
    method='post',
    operation_description="Add users to group",
    operation_summary="Add Group Members",
    request_body=GroupMembershipSerializer,
    responses={200: "Members added successfully"},
    tags=['Groups']
)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def group_members(request, group_id):
    """List or add group members."""
    group = get_object_or_404(Group, id=group_id)
    
    # Check access
    is_member = request.user.groups.filter(id=group_id).exists()
    
    if not (is_member or request.user.is_staff):
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        members = group.user_set.all()
        serializer = UserGroupSerializer(members, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        # Allow group members to add other members, not just staff
        if not (is_member or request.user.is_staff):
            return Response({'error': 'Only group members or staff can add members'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = GroupMembershipSerializer(data=request.data)
        if serializer.is_valid():
            user_ids = serializer.validated_data['user_ids']
            added_count = 0
            
            for user_id in user_ids:
                try:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    user = User.objects.get(id=user_id)
                    group.user_set.add(user)
                    added_count += 1
                except User.DoesNotExist:
                    continue
            
            return Response({
                'message': f'Added {added_count} members to group',
                'added_count': added_count
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='delete',
    operation_description="Remove user from group",
    operation_summary="Remove Group Member",
    responses={204: "No content"},
    tags=['Groups']
)
@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def group_member_remove(request, group_id, user_id):
    """Remove a user from a group."""
    group = get_object_or_404(Group, id=group_id)
    
    # Check if requesting user can manage this group
    is_member = request.user.groups.filter(id=group_id).exists()
    if not (is_member or request.user.is_staff):
        return Response({'error': 'Only group members or staff can remove members'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=user_id)
        group.user_set.remove(user)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


# ============ SHARE LINK ENDPOINTS ============

@swagger_auto_schema(
    method='get',
    operation_description="List share links for a document",
    operation_summary="List Document Share Links",
    responses={200: ShareLinkSerializer(many=True)},
    tags=['Share Links']
)
@swagger_auto_schema(
    method='post',
    operation_description="Create a share link for a document",
    operation_summary="Create Share Link",
    request_body=ShareLinkCreateSerializer,
    responses={201: ShareLinkSerializer},
    tags=['Share Links']
)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, DocumentAccessPermission])
def document_share_links(request, document_id):
    """List or create share links for a document."""
    document = get_object_or_404(Document, id=document_id)
    
    # Check if user can share this document
    from .permissions import user_can_perform_action, Action
    if not user_can_perform_action(request.user, document, Action.SHARE):
        return Response({'error': 'You do not have permission to share this document'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        share_links = ShareLink.objects.filter(document=document)
        serializer = ShareLinkSerializer(share_links, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = ShareLinkCreateSerializer(
            data=request.data,
            context={'request': request, 'document': document}
        )
        if serializer.is_valid():
            # Force VIEWER role for security - share links should only grant read access
            share_link = serializer.save(role='VIEWER')

            # Create ACL entry for the share link (always VIEWER)
            ACL.objects.create(
                document=document,
                subject_type='share_link',
                subject_id=str(share_link.id),
                role='VIEWER',
                expires_at=share_link.expires_at,
                created_by=request.user
            )
            
            response_serializer = ShareLinkSerializer(share_link)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='delete',
    operation_description="Revoke a share link",
    operation_summary="Revoke Share Link",
    responses={204: "No content"},
    tags=['Share Links']
)
@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def share_link_revoke(request, share_link_id):
    """Revoke a share link."""
    share_link = get_object_or_404(ShareLink, id=share_link_id)
    
    # Check if user can revoke this share link
    from .permissions import user_can_perform_action, Action
    if not user_can_perform_action(request.user, share_link.document, Action.SHARE):
        return Response({'error': 'You do not have permission to revoke this share link'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    # Mark as revoked
    from django.utils import timezone
    share_link.revoked_at = timezone.now()
    share_link.save()
    
    # Remove corresponding ACL entry
    ACL.objects.filter(
        document=share_link.document,
        subject_type='share_link',
        subject_id=str(share_link.id)
    ).delete()
    
    return Response(status=status.HTTP_204_NO_CONTENT)


@swagger_auto_schema(
    method='get',
    operation_description="Access a document via share link token",
    operation_summary="Access Document via Share Link",
    manual_parameters=[
        openapi.Parameter('token', openapi.IN_PATH, description="Share link token", type=openapi.TYPE_STRING, required=True),
    ],
    responses={200: DocumentSerializer, 404: "Share link not found or expired"},
    tags=['Share Links']
)
@api_view(['GET'])
@permission_classes([AllowAny])
def share_link_access(request, token):
    """Access a document via share link token."""
    try:
        from django.utils import timezone
        
        share_link = ShareLink.objects.get(
            token=token,
            revoked_at__isnull=True
        )
        
        # Check if expired
        if share_link.expires_at and share_link.expires_at < timezone.now():
            return Response({'error': 'Share link has expired'}, status=status.HTTP_404_NOT_FOUND)
        
        # Return document data with limited access based on share link role
        document = share_link.document
        serializer = DocumentSerializer(document, context={'request': request})
        
        return Response({
            'document': serializer.data,
            'access_role': share_link.role,
            'share_link_id': share_link.id
        })
        
    except ShareLink.DoesNotExist:
        return Response({'error': 'Share link not found'}, status=status.HTTP_404_NOT_FOUND)


# === AUDIT LOGGING AND VERSION HISTORY ENDPOINTS ===

@swagger_auto_schema(
    method='get',
    operation_description="Get audit log for a document (requires VIEW access or higher)",
    responses={
        200: AuditLogSerializer(many=True),
        403: "Access denied",
        404: "Document not found"
    }
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_audit_log(request, document_id):
    """Get audit log entries for a specific document."""
    try:
        document = get_object_or_404(Document, id=document_id)
        
        # Check permissions using our custom permission class
        permission = DocumentAccessPermission()
        if not permission.has_object_permission(request, None, document):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get audit logs for this document, ordered by most recent first
        audit_logs = AuditLog.objects.filter(document=document).order_by('-ts')
        
        # Add pagination if needed
        page_size = int(request.GET.get('page_size', 50))
        page = int(request.GET.get('page', 1))
        start = (page - 1) * page_size
        end = start + page_size
        
        paginated_logs = audit_logs[start:end]
        serializer = AuditLogSerializer(paginated_logs, many=True)
        
        # Log this audit log view
        log_audit_event(
            action=Action.VIEW,
            request=request,
            document=document,
            context={'audit_log_accessed': True}
        )
        
        return Response({
            'results': serializer.data,
            'count': audit_logs.count(),
            'page': page,
            'page_size': page_size
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method='get',
    operation_description="Get version history for a document (requires VIEW access or higher)",
    responses={
        200: DocumentVersionListSerializer(many=True),
        403: "Access denied",
        404: "Document not found"
    }
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_version_history(request, document_id):
    """Get version history for a specific document."""
    try:
        document = get_object_or_404(Document, id=document_id)
        
        # Check permissions
        permission = DocumentAccessPermission()
        if not permission.has_object_permission(request, None, document):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get versions ordered by version number (newest first)
        versions = DocumentVersion.objects.filter(document=document).order_by('-version_no')
        serializer = DocumentVersionListSerializer(versions, many=True)
        
        # Log this version history view
        log_audit_event(
            action=Action.VIEW,
            request=request,
            document=document,
            context={'version_history_accessed': True}
        )
        
        return Response(serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method='get',
    operation_description="Get specific document version content (requires VIEW access or higher)",
    responses={
        200: DocumentVersionSerializer,
        403: "Access denied",
        404: "Document or version not found"
    }
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_version_detail(request, document_id, version_id):
    """Get detailed content for a specific document version."""
    try:
        document = get_object_or_404(Document, id=document_id)
        version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        
        # Check permissions
        permission = DocumentAccessPermission()
        if not permission.has_object_permission(request, None, document):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = DocumentVersionSerializer(version)
        
        # Log this version view
        log_audit_event(
            action=Action.VIEW,
            request=request,
            document=document,
            version_no=version.version_no,
            context={'version_detail_accessed': True}
        )
        
        return Response(serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method='post',
    operation_description="Restore document to a previous version (requires EDIT access or higher)",
    request_body=DocumentRestoreSerializer,
    responses={
        200: DocumentSerializer,
        403: "Access denied - requires EDIT permission",
        404: "Document or version not found",
        400: "Invalid version ID"
    }
)
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_restore_version(request, document_id):
    """Restore a document to a previous version."""
    try:
        document = get_object_or_404(Document, id=document_id)
        
        # Check permissions - requires EDIT access
        permission = DocumentAccessPermission()
        if not permission.has_object_permission(request, None, document):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Additional check for EDIT permission specifically
        if not user_can_perform_action(request.user, document, Action.EDIT):
            return Response({'error': 'Edit permission required to restore versions'}, status=status.HTTP_403_FORBIDDEN)
        
        # Validate request data
        serializer = DocumentRestoreSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        version_id = serializer.validated_data['version_id']
        change_note = serializer.validated_data.get('change_note', 'Restored from previous version')
        
        # Get the version to restore from
        restore_version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        
        # Create a new version with the restored content
        new_version_no = document.current_version_no + 1
        
        # Create new version entry
        new_version = DocumentVersion.objects.create(
            document=document,
            version_no=new_version_no,
            html=restore_version.html,
            text=restore_version.text,
            author=request.user,
            change_note=f"{change_note} (restored from version {restore_version.version_no})",
            hash=restore_version.hash  # Could generate new hash if needed
        )
        
        # Update document with restored content
        document.html = restore_version.html
        document.text = restore_version.text
        document.current_version_no = new_version_no
        document.save()
        
        # Log the restoration
        log_document_edit(request, document, version_no=new_version_no, changes={
            'action': 'version_restore',
            'restored_from_version': restore_version.version_no,
            'change_note': change_note
        })
        
        # Return updated document
        doc_serializer = DocumentSerializer(document, context={'request': request})
        return Response(doc_serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============ GROUP DOCUMENTS ============

@swagger_auto_schema(
    method='get',
    operation_description="Get all documents shared with a specific group via ACL",
    operation_summary="List Group Documents",
    responses={
        200: DocumentListSerializer(many=True),
        403: "Access denied - user is not a member of this group",
        404: "Group not found"
    },
    tags=['Groups']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def group_documents(request, group_id):
    """Get all documents shared with a specific group."""
    # Check if group exists
    group = get_object_or_404(Group, id=group_id)
    
    # Check if user is a member of this group or is staff
    is_member = request.user.groups.filter(id=group_id).exists()
    if not (is_member or request.user.is_staff or request.user.is_superuser):
        return Response({'error': 'Access denied. You are not a member of this group.'}, status=status.HTTP_403_FORBIDDEN)
    
    # Get all documents shared with this group via ACL
    group_acls = ACL.objects.filter(
        subject_type='group',
        subject_id=str(group_id)
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    ).select_related('document')
    
    # Get unique documents
    document_ids = group_acls.values_list('document_id', flat=True).distinct()
    documents = Document.objects.filter(id__in=document_ids).order_by('-updated_at')
    
    # Create response with role info
    result = []
    for doc in documents:
        doc_acl = group_acls.filter(document=doc).first()
        doc_data = DocumentListSerializer(doc, context={'request': request}).data
        doc_data['group_role'] = doc_acl.role if doc_acl else None
        result.append(doc_data)
    
    return Response(result)


@swagger_auto_schema(
    method='get',
    operation_description="Get documents grouped by all user's groups with document counts",
    operation_summary="List All Groups with Document Counts",
    responses={200: "List of groups with document counts"},
    tags=['Groups']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def groups_with_documents(request):
    """Get all user's groups with document counts for each."""
    # All users see only groups they belong to
    groups = request.user.groups.all()

    result = []
    for group in groups:
        # Count documents shared with this group
        doc_count = ACL.objects.filter(
            subject_type='group',
            subject_id=str(group.id)
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).values('document_id').distinct().count()

        # Check ownership
        is_owner = False
        created_by_username = None
        try:
            ownership = group.ownership
            is_owner = ownership.owner_id == request.user.id
            created_by_username = ownership.owner.username
        except GroupOwnership.DoesNotExist:
            pass

        result.append({
            'id': group.id,
            'name': group.name,
            'document_count': doc_count,
            'member_count': group.user_set.count(),
            'is_owner': is_owner,
            'created_by_username': created_by_username,
        })

    return Response(result)


# ============ ACL MANAGEMENT ============

@swagger_auto_schema(
    method='get',
    operation_description="Get all ACL entries for a document",
    operation_summary="List Document ACLs",
    responses={200: ACLSerializer(many=True)},
    tags=['ACL']
)
@swagger_auto_schema(
    method='post',
    operation_description="Add a new ACL entry to a document (grant access to user or group)",
    operation_summary="Create Document ACL",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'subject_type': openapi.Schema(type=openapi.TYPE_STRING, enum=['user', 'group'], description="Type of subject"),
            'subject_id': openapi.Schema(type=openapi.TYPE_STRING, description="ID of the user or group"),
            'role': openapi.Schema(type=openapi.TYPE_STRING, enum=['VIEWER', 'EDITOR', 'OWNER'], description="Access role"),
            'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time', description="Optional expiration date")
        },
        required=['subject_type', 'subject_id', 'role']
    ),
    responses={201: ACLSerializer, 400: "Bad request", 403: "Access denied"},
    tags=['ACL']
)
@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_acl_list_create(request, document_id):
    """List or create ACL entries for a document."""
    document = get_object_or_404(Document, id=document_id)
    
    # Check if user has SHARE permission
    if not user_can_perform_action(request.user, document, Action.SHARE):
        return Response({'error': 'Access denied. SHARE permission required.'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        acls = ACL.objects.filter(document=document)
        
        # Enrich with subject names
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        result = []
        for acl in acls:
            acl_data = ACLSerializer(acl).data
            
            if acl.subject_type == 'user':
                try:
                    user = User.objects.get(id=int(acl.subject_id))
                    acl_data['subject_name'] = user.email or user.username
                except (User.DoesNotExist, ValueError):
                    acl_data['subject_name'] = f"User #{acl.subject_id}"
            elif acl.subject_type == 'group':
                try:
                    group = Group.objects.get(id=int(acl.subject_id))
                    acl_data['subject_name'] = group.name
                except (Group.DoesNotExist, ValueError):
                    acl_data['subject_name'] = f"Group #{acl.subject_id}"
            else:
                acl_data['subject_name'] = acl.subject_id
            
            result.append(acl_data)
        
        return Response(result)
    
    elif request.method == 'POST':
        subject_type = request.data.get('subject_type')
        subject_id = request.data.get('subject_id')
        role = request.data.get('role')
        expires_at = request.data.get('expires_at')
        
        # Validate required fields
        if not subject_type or not subject_id or not role:
            return Response({'error': 'subject_type, subject_id, and role are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if subject_type not in ['user', 'group']:
            return Response({'error': 'subject_type must be "user" or "group"'}, status=status.HTTP_400_BAD_REQUEST)
        
        if role not in ['VIEWER', 'EDITOR', 'OWNER']:
            return Response({'error': 'role must be VIEWER, EDITOR, or OWNER'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify subject exists
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        subject_name = None
        if subject_type == 'user':
            try:
                user = User.objects.get(id=int(subject_id))
                subject_name = user.email or user.username
            except (User.DoesNotExist, ValueError):
                return Response({'error': f'User with ID {subject_id} not found'}, status=status.HTTP_404_NOT_FOUND)
        elif subject_type == 'group':
            try:
                group = Group.objects.get(id=int(subject_id))
                subject_name = group.name
            except (Group.DoesNotExist, ValueError):
                return Response({'error': f'Group with ID {subject_id} not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Create or update ACL
        acl, created = ACL.objects.update_or_create(
            document=document,
            subject_type=subject_type,
            subject_id=str(subject_id),
            defaults={
                'role': role,
                'expires_at': expires_at,
                'created_by': request.user
            }
        )
        
        # Log the share action
        log_document_share(request, document, shared_with=subject_name, role=role)

        # Notify
        try:
            from .utils.notifications import notify_acl_granted
            notify_acl_granted(acl, request.user)
        except Exception:
            pass

        acl_data = ACLSerializer(acl).data
        acl_data['subject_name'] = subject_name

        return Response(acl_data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@swagger_auto_schema(
    method='put',
    operation_description="Update an ACL entry's role or expiration",
    operation_summary="Update Document ACL",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'role': openapi.Schema(type=openapi.TYPE_STRING, enum=['VIEWER', 'EDITOR', 'OWNER']),
            'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time')
        }
    ),
    responses={200: ACLSerializer, 403: "Access denied", 404: "ACL not found"},
    tags=['ACL']
)
@swagger_auto_schema(
    method='delete',
    operation_description="Remove an ACL entry (revoke access)",
    operation_summary="Delete Document ACL",
    responses={204: "No content", 403: "Access denied", 404: "ACL not found"},
    tags=['ACL']
)
@api_view(['PUT', 'DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_acl_detail(request, document_id, acl_id):
    """Update or delete a specific ACL entry."""
    document = get_object_or_404(Document, id=document_id)
    acl = get_object_or_404(ACL, id=acl_id, document=document)
    
    # Check if user has SHARE permission
    if not user_can_perform_action(request.user, document, Action.SHARE):
        return Response({'error': 'Access denied. SHARE permission required.'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'DELETE':
        try:
            from .utils.notifications import notify_acl_revoked
            notify_acl_revoked(acl, request.user)
        except Exception:
            pass
        log_access_revoked(request, document, revoked_from=f"{acl.subject_type}:{acl.subject_id}")
        acl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    elif request.method == 'PUT':
        role = request.data.get('role')
        expires_at = request.data.get('expires_at')
        old_role = acl.role

        if role:
            if role not in ['VIEWER', 'EDITOR', 'OWNER']:
                return Response({'error': 'role must be VIEWER, EDITOR, or OWNER'}, status=status.HTTP_400_BAD_REQUEST)
            acl.role = role

        if 'expires_at' in request.data:
            acl.expires_at = expires_at

        acl.save()

        if role and old_role != role:
            try:
                from .utils.notifications import notify_acl_changed
                notify_acl_changed(acl, old_role, role, request.user)
            except Exception:
                pass

        return Response(ACLSerializer(acl).data)


# === EVENT POLLING ENDPOINT ===

@swagger_auto_schema(
    method='get',
    operation_description="Poll for document events since a timestamp",
    manual_parameters=[
        openapi.Parameter('since', openapi.IN_QUERY, description="ISO 8601 timestamp", type=openapi.TYPE_STRING, required=True),
    ],
    responses={
        200: AuditLogSerializer(many=True),
        400: "Invalid or missing since parameter",
        403: "Access denied",
        404: "Document not found"
    },
    tags=['Events']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def document_events_poll(request, document_id):
    """
    Poll for new events on a document.
    Returns events since the given timestamp, excluding the current user's own actions.
    """
    document = get_object_or_404(Document, id=document_id)

    permission = DocumentAccessPermission()
    if not permission.has_object_permission(request, None, document):
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    since_param = request.GET.get('since')
    if not since_param:
        return Response({'error': 'since parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        since_dt = parse_datetime(since_param)
        if since_dt is None:
            raise ValueError("Invalid datetime")
    except (ValueError, TypeError):
        return Response({'error': 'Invalid since timestamp format. Use ISO 8601.'}, status=status.HTTP_400_BAD_REQUEST)

    events = AuditLog.objects.filter(
        document=document,
        ts__gt=since_dt
    ).exclude(
        actor_user=request.user
    ).select_related('actor_user').order_by('ts')[:20]

    serializer = AuditLogSerializer(events, many=True)

    return Response({
        'events': serializer.data,
        'server_time': timezone.now().isoformat(),
        'has_more': len(serializer.data) == 20
    })


@swagger_auto_schema(
    method='get',
    operation_description="Poll for changes to a group's accessible documents",
    manual_parameters=[
        openapi.Parameter('since', openapi.IN_QUERY, description="ISO 8601 timestamp", type=openapi.TYPE_STRING, required=True),
    ],
    responses={
        200: "Change detection result with has_changes boolean",
        400: "Invalid or missing since parameter",
        403: "Access denied",
        404: "Group not found"
    },
    tags=['Events']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def group_events_poll(request, group_id):
    """
    Poll for changes to a group's document list.
    Returns whether any documents were added, removed, or had sharing changes.
    """
    group = get_object_or_404(Group, id=group_id)

    is_member = request.user.groups.filter(id=group_id).exists()
    if not (is_member or request.user.is_staff or request.user.is_superuser):
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    since_param = request.GET.get('since')
    if not since_param:
        return Response({'error': 'since parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        since_dt = parse_datetime(since_param)
        if since_dt is None:
            raise ValueError("Invalid datetime")
    except (ValueError, TypeError):
        return Response({'error': 'Invalid since timestamp format. Use ISO 8601.'}, status=status.HTTP_400_BAD_REQUEST)

    # Detect new documents shared with this group
    has_new_docs = ACL.objects.filter(
        subject_type='group',
        subject_id=str(group_id),
        created_at__gt=since_dt
    ).exclude(created_by=request.user).exists()

    # Detect share changes or revocations on group documents
    group_doc_ids = ACL.objects.filter(
        subject_type='group',
        subject_id=str(group_id)
    ).values_list('document_id', flat=True)

    has_share_changes = AuditLog.objects.filter(
        action=Action.SHARE,
        ts__gt=since_dt
    ).exclude(
        actor_user=request.user
    ).filter(
        Q(document_id__in=group_doc_ids) |
        Q(context__revoked_from=f'group:{group_id}')
    ).exists()

    has_changes = has_new_docs or has_share_changes

    return Response({
        'has_changes': has_changes,
        'server_time': timezone.now().isoformat(),
    })

@swagger_auto_schema(
    method='get',
    operation_description="Poll for changes across ALL of the current user's groups. Returns whether any documents were added or sharing changed.",
    manual_parameters=[
        openapi.Parameter('since', openapi.IN_QUERY, description="ISO 8601 timestamp", type=openapi.TYPE_STRING, required=True),
    ],
    responses={
        200: "Change detection result with has_changes boolean",
        400: "Invalid or missing since parameter",
    },
    tags=['Events']
)
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def user_groups_events_poll(request):
    """
    Poll for changes across ALL groups the user belongs to.
    Returns whether any documents were added, removed, or had sharing changes in any user group.
    """
    since_param = request.GET.get('since')
    if not since_param:
        return Response({'error': 'since parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        since_dt = parse_datetime(since_param)
        if since_dt is None:
            raise ValueError("Invalid datetime")
    except (ValueError, TypeError):
        return Response({'error': 'Invalid since timestamp format. Use ISO 8601.'}, status=status.HTTP_400_BAD_REQUEST)

    # Get all group IDs the user belongs to
    user_group_ids = list(request.user.groups.values_list('id', flat=True))

    if not user_group_ids:
        return Response({
            'has_changes': False,
            'server_time': timezone.now().isoformat(),
        })

    # Detect new documents shared with any of user's groups
    has_new_docs = ACL.objects.filter(
        subject_type='group',
        subject_id__in=[str(gid) for gid in user_group_ids],
        created_at__gt=since_dt
    ).exclude(created_by=request.user).exists()

    # Detect share changes or revocations on group documents
    group_doc_ids = ACL.objects.filter(
        subject_type='group',
        subject_id__in=[str(gid) for gid in user_group_ids]
    ).values_list('document_id', flat=True)

    # Build Q filter for revocation context matches
    revocation_q = Q()
    for gid in user_group_ids:
        revocation_q |= Q(context__revoked_from=f'group:{gid}')

    has_share_changes = AuditLog.objects.filter(
        action=Action.SHARE,
        ts__gt=since_dt
    ).exclude(
        actor_user=request.user
    ).filter(
        Q(document_id__in=group_doc_ids) | revocation_q
    ).exists()

    has_changes = has_new_docs or has_share_changes

    return Response({
        'has_changes': has_changes,
        'server_time': timezone.now().isoformat(),
    })


# --- Notification Endpoints ---

@swagger_auto_schema(method='get', tags=['Notifications'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """List user's notifications, optionally filtered by ?unread=true."""
    qs = Notification.objects.filter(recipient=request.user)
    if request.query_params.get('unread') == 'true':
        qs = qs.filter(read=False)
    from .serializers import NotificationSerializer
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 20))
    start = (page - 1) * page_size
    end = start + page_size
    total = qs.count()
    items = qs[start:end]
    return Response({
        'count': total,
        'results': NotificationSerializer(items, many=True).data,
    })


@swagger_auto_schema(method='get', tags=['Notifications'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_unread_count(request):
    """Get count of unread notifications."""
    count = Notification.objects.filter(recipient=request.user, read=False).count()
    return Response({'count': count})


@swagger_auto_schema(method='post', tags=['Notifications'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, notification_id):
    """Mark a single notification as read."""
    notif = get_object_or_404(Notification, id=notification_id, recipient=request.user)
    notif.read = True
    notif.save(update_fields=['read'])
    return Response({'ok': True})


@swagger_auto_schema(method='post', tags=['Notifications'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_mark_all_read(request):
    """Mark all notifications as read."""
    Notification.objects.filter(recipient=request.user, read=False).update(read=True)
    return Response({'ok': True})


@swagger_auto_schema(method='get', tags=['Notifications'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def notifications_poll(request):
    """Poll for new notifications since a given timestamp."""
    since = request.query_params.get('since')
    qs = Notification.objects.filter(recipient=request.user)
    if since:
        since_dt = parse_datetime(since)
        if since_dt:
            qs = qs.filter(created_at__gt=since_dt)
    from .serializers import NotificationSerializer
    return Response({
        'notifications': NotificationSerializer(qs[:20], many=True).data,
        'server_time': timezone.now().isoformat(),
    })


# --- Admin Endpoints ---

def _require_admin(request):
    if not request.user or not request.user.is_superuser:
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
    return None


@swagger_auto_schema(method='get', tags=['Admin'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    """List all users with their profiles. Filter by ?status=<approval_status>."""
    denied = _require_admin(request)
    if denied:
        return denied
    from django.contrib.auth import get_user_model
    User = get_user_model()

    status_filter = request.query_params.get('status')
    users = User.objects.all().order_by('-date_joined')

    result = []
    for u in users:
        profile_data = {}
        try:
            p = u.profile
            profile_data = {
                'email_verified': p.email_verified,
                'approval_status': p.approval_status,
                'rejected_reason': p.rejected_reason,
                'profile_created_at': p.created_at.isoformat() if p.created_at else None,
            }
        except UserProfile.DoesNotExist:
            profile_data = {
                'email_verified': True,
                'approval_status': 'approved',
                'rejected_reason': None,
                'profile_created_at': None,
            }

        if status_filter and profile_data.get('approval_status') != status_filter:
            continue

        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'is_active': u.is_active,
            'is_superuser': u.is_superuser,
            'date_joined': u.date_joined.isoformat(),
            **profile_data,
        })

    return Response(result)


@swagger_auto_schema(method='post', tags=['Admin'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_user_approve(request, user_id):
    """Approve a user account."""
    denied = _require_admin(request)
    if denied:
        return denied
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = get_object_or_404(User, id=user_id)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.approval_status = ApprovalStatus.APPROVED
    profile.save(update_fields=['approval_status'])

    try:
        from .utils.notifications import notify_account_approved
        notify_account_approved(user)
    except Exception:
        pass

    return Response({'message': f'User {user.username} approved'})


@swagger_auto_schema(
    method='post',
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'reason': openapi.Schema(type=openapi.TYPE_STRING),
        }
    ),
    tags=['Admin']
)
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_user_reject(request, user_id):
    """Reject a user account."""
    denied = _require_admin(request)
    if denied:
        return denied
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = get_object_or_404(User, id=user_id)
    reason = request.data.get('reason', '')
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.approval_status = ApprovalStatus.REJECTED
    profile.rejected_reason = reason
    profile.save(update_fields=['approval_status', 'rejected_reason'])

    try:
        from .utils.notifications import notify_account_rejected
        notify_account_rejected(user, reason)
    except Exception:
        pass

    return Response({'message': f'User {user.username} rejected'})


@swagger_auto_schema(method='delete', tags=['Admin'])
@api_view(['DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_user_delete(request, user_id):
    """Delete a user account."""
    denied = _require_admin(request)
    if denied:
        return denied
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = get_object_or_404(User, id=user_id)
    if user.id == request.user.id:
        return Response({'error': 'Cannot delete your own account'}, status=400)
    username = user.username
    user.delete()
    return Response({'message': f'User {username} deleted'})


@swagger_auto_schema(method='post', tags=['Admin'])
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_user_resend_verification(request, user_id):
    """Resend verification email for a user."""
    denied = _require_admin(request)
    if denied:
        return denied
    from django.contrib.auth import get_user_model
    from .utils.email_service import generate_verification_code, send_verification_email
    User = get_user_model()
    user = get_object_or_404(User, id=user_id)
    if not user.email:
        return Response({'error': 'User has no email address'}, status=400)

    profile, _ = UserProfile.objects.get_or_create(user=user)
    code = generate_verification_code()
    profile.email_verification_code = code
    profile.email_verification_expires = timezone.now() + timezone.timedelta(minutes=15)
    profile.save(update_fields=['email_verification_code', 'email_verification_expires'])

    send_verification_email(user, code)
    return Response({'message': f'Verification email resent to {user.email}'})


@swagger_auto_schema(method='get', tags=['Admin'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_acl_list(request):
    """List all ACLs with filters."""
    denied = _require_admin(request)
    if denied:
        return denied

    qs = ACL.objects.all().select_related('document', 'created_by').order_by('-created_at')
    document_id = request.query_params.get('document_id')
    user_id = request.query_params.get('user_id')
    subject_type = request.query_params.get('subject_type')
    role = request.query_params.get('role')
    search = request.query_params.get('search')

    if document_id:
        qs = qs.filter(document_id=document_id)
    if user_id:
        qs = qs.filter(subject_type='user', subject_id=str(user_id))
    if subject_type:
        qs = qs.filter(subject_type=subject_type)
    if role:
        qs = qs.filter(role=role)

    from django.contrib.auth import get_user_model
    User = get_user_model()

    # Build enriched results first (for search filtering)
    all_results = []
    for acl in qs:
        data = ACLSerializer(acl).data
        data['document_title'] = acl.document.title if acl.document else None
        if acl.subject_type == 'user':
            try:
                u = User.objects.get(id=int(acl.subject_id))
                data['subject_name'] = u.username
            except (User.DoesNotExist, ValueError):
                data['subject_name'] = f'User #{acl.subject_id}'
        elif acl.subject_type == 'group':
            try:
                g = Group.objects.get(id=int(acl.subject_id))
                data['subject_name'] = g.name
            except (Group.DoesNotExist, ValueError):
                data['subject_name'] = f'Group #{acl.subject_id}'
        else:
            data['subject_name'] = acl.subject_id
        all_results.append(data)

    # Apply text search across subject_name and document_title
    if search:
        search_lower = search.lower()
        all_results = [r for r in all_results if
            search_lower in (r.get('subject_name') or '').lower() or
            search_lower in (r.get('document_title') or '').lower()]

    # Pagination
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 20))
    total = len(all_results)
    start = (page - 1) * page_size
    end = start + page_size
    page_results = all_results[start:end]

    return Response({
        'results': page_results,
        'count': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size if total > 0 else 1,
    })


@swagger_auto_schema(
    method='put',
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'role': openapi.Schema(type=openapi.TYPE_STRING),
            'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
        }
    ),
    tags=['Admin']
)
@swagger_auto_schema(method='delete', tags=['Admin'])
@api_view(['PUT', 'DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_acl_detail(request, acl_id):
    """Update or delete an ACL entry as admin."""
    denied = _require_admin(request)
    if denied:
        return denied

    acl = get_object_or_404(ACL, id=acl_id)

    if request.method == 'DELETE':
        try:
            from .utils.notifications import notify_acl_revoked
            notify_acl_revoked(acl, request.user)
        except Exception:
            pass
        acl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    elif request.method == 'PUT':
        role = request.data.get('role')
        expires_at = request.data.get('expires_at')
        old_role = acl.role
        if role:
            if role not in ['VIEWER', 'EDITOR', 'OWNER']:
                return Response({'error': 'Invalid role'}, status=400)
            acl.role = role
        if 'expires_at' in request.data:
            acl.expires_at = expires_at
        acl.save()
        if role and old_role != role:
            try:
                from .utils.notifications import notify_acl_changed
                notify_acl_changed(acl, old_role, role, request.user)
            except Exception:
                pass
        return Response(ACLSerializer(acl).data)


@swagger_auto_schema(method='get', tags=['Admin'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_dashboard_stats(request):
    """Get dashboard stats for admin."""
    denied = _require_admin(request)
    if denied:
        return denied

    from django.contrib.auth import get_user_model
    User = get_user_model()

    total_users = User.objects.count()
    users_by_status = {}
    for s in ApprovalStatus.choices:
        users_by_status[s[0]] = UserProfile.objects.filter(approval_status=s[0]).count()

    total_documents = Document.objects.count()
    total_acls = ACL.objects.count()

    recent_registrations = []
    for u in User.objects.order_by('-date_joined')[:10]:
        profile_data = {}
        try:
            p = u.profile
            profile_data = {
                'approval_status': p.approval_status,
                'email_verified': p.email_verified,
            }
        except UserProfile.DoesNotExist:
            profile_data = {'approval_status': 'approved', 'email_verified': True}
        recent_registrations.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'date_joined': u.date_joined.isoformat(),
            **profile_data,
        })

    recent_activity = AuditLogSerializer(
        AuditLog.objects.all().order_by('-ts')[:20],
        many=True
    ).data

    return Response({
        'total_users': total_users,
        'users_by_status': users_by_status,
        'total_documents': total_documents,
        'total_acls': total_acls,
        'recent_registrations': recent_registrations,
        'recent_activity': recent_activity,
    })


@swagger_auto_schema(method='get', tags=['Admin'])
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_groups_list(request):
    """List all groups with owner info for admin dashboard."""
    denied = _require_admin(request)
    if denied:
        return denied

    groups = Group.objects.all()
    result = []
    for group in groups:
        owner_username = None
        try:
            ownership = group.ownership
            owner_username = ownership.owner.username
        except GroupOwnership.DoesNotExist:
            pass

        result.append({
            'id': group.id,
            'name': group.name,
            'member_count': group.user_set.count(),
            'owner_username': owner_username,
        })

    return Response(result)