"""
URL configuration for my_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

# Swagger schema configuration
schema_view = get_schema_view(
    openapi.Info(
        title="Document Management System with OCR & QR Codes",
        default_version='v1',
        description="""
        Django-based document management system with OCR capabilities and QR code generation.
        
        This API provides comprehensive document management features including:
        
        **OCR Features:**
        - Extract text from uploaded images and PDF files using EasyOCR
        - Support for PNG, JPEG, and PDF files
        - Advanced image preprocessing for better OCR accuracy
        - Detailed positioning information for extracted text
        - PDF to image conversion with multi-page support
        
        **Document Management:**
        - Upload and store documents in PostgreSQL database
        - Automatic QR code generation for each document
        - QR codes contain URLs pointing to document details
        - Full CRUD operations for document management
        - Media file serving for documents and QR codes
        
        **QR Code Features:**
        - Automatic generation when documents are created
        - PNG format with customizable size and border
        - Direct image serving endpoint for QR codes
        - Links to QR resolve endpoint with permission checks
        
        **Usage Workflow:**
        1. Upload a document via OCR endpoint or direct document creation
        2. System automatically generates QR code with document URL
        3. Use document management endpoints to list, view, update, or delete documents
        4. Access QR code images directly via dedicated endpoints
        
        **File Requirements:**
        - Maximum file size: 10MB
        - Supported formats: PNG, JPEG, PDF
        - Database: PostgreSQL (localhost:5432/docmanager)
        """,
        terms_of_service="https://www.google.com/policies/terms/",
        contact=openapi.Contact(email="admin@example.com"),
        license=openapi.License(name="MIT License"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/', include('my_app.urls')),
    
    # Swagger UI endpoints
    path('swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    
    # Root endpoint redirects to swagger
    path('', schema_view.with_ui('swagger', cache_timeout=0), name='api-root'),
]

# Serve media files
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
