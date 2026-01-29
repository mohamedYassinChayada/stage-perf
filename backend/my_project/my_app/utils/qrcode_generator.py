"""
QR Code generation utilities for document management system.
"""

import qrcode
from io import BytesIO
from PIL import Image
from ..models import QRLink
import logging

logger = logging.getLogger(__name__)

def generate_qr_code(data, size=(300, 300), border=4):
    """
    Generate a QR code image from the given data.

    Args:
        data (str): The data to encode in the QR code
        size (tuple): Size of the QR code image (width, height)
        border (int): Border size in boxes

    Returns:
        bytes: PNG image data as bytes

    Raises:
        Exception: If QR code generation fails
    """
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=border,
        )

        qr.add_data(data)
        qr.make(fit=True)

        qr_image = qr.make_image(fill_color="black", back_color="white")

        if size != qr_image.size:
            qr_image = qr_image.resize(size, Image.Resampling.LANCZOS)

        buffer = BytesIO()
        qr_image.save(buffer, format='PNG')
        return buffer.getvalue()

    except Exception as e:
        logger.error(f"Error generating QR code: {str(e)}")
        raise Exception(f"QR code generation failed: {str(e)}")

def generate_document_qr_code(document_id, base_url=None):
    """
    Generate a QR code for a specific document.

    Args:
        document_id (int): The ID of the document
        base_url (str, optional): Base URL for the application

    Returns:
        bytes: PNG image data as bytes
    """
    try:
        from django.conf import settings as django_settings
        if not base_url:
            base_url = getattr(django_settings, 'BASE_URL', 'http://localhost:8000')

        qr = QRLink.objects.filter(document_id=document_id, active=True).order_by('-created_at').first()
        if qr:
            document_url = f"{base_url}/api/qr/resolve/{qr.code}/"
        else:
            document_url = f"{base_url}/api/documents/{document_id}/"

        logger.info(f"Generating QR code for document {document_id} with URL: {document_url}")

        qr_data = generate_qr_code(data=document_url, size=(300, 300), border=4)

        logger.info(f"Successfully generated QR code for document {document_id}")
        return qr_data

    except Exception as e:
        logger.error(f"Error generating QR code for document {document_id}: {str(e)}")
        raise Exception(f"Failed to generate QR code for document {document_id}: {str(e)}")

def update_document_qr_code(document):
    """
    Generate and save QR code binary data for a document instance.

    Args:
        document: Document model instance

    Returns:
        bool: True if successful
    """
    try:
        if not document.id:
            raise Exception("Document must be saved before generating QR code")

        logger.info(f"Updating QR code for document: {document.title} (ID: {document.id})")

        qr_data = generate_document_qr_code(document.id)
        document.qr_code_data = qr_data

        logger.info(f"Successfully updated QR code for document {document.id}")
        return True

    except Exception as e:
        logger.error(f"Error updating QR code for document {document.id if document else 'unknown'}: {str(e)}")
        raise Exception(f"Failed to update QR code: {str(e)}")

def get_qr_code_info():
    """
    Get information about QR code generation capabilities.
    """
    return {
        "qr_code_generator": "qrcode library",
        "storage": "PostgreSQL binary field (Neon cloud DB)",
        "supported_formats": ["PNG"],
        "default_size": "300x300 pixels",
        "error_correction": "Low (~7%)",
        "encoding": "UTF-8",
        "features": [
            "Document URL encoding",
            "Binary storage in cloud database",
            "Customizable size and border",
            "PNG format output"
        ]
    }
