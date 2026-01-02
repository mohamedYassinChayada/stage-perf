# QR Code Document Management System - Implementation Guide

## Overview

This implementation adds comprehensive QR code generation functionality to your Django-based document management system. When documents are created, QR codes are automatically generated that link to the document's URL, providing easy access via mobile devices.

## Features Implemented

### Django Backend
- **Document Model**: Extended with `qr_code` ImageField for storing QR code images
- **QR Code Generation**: Automatic QR code creation when documents are uploaded
- **PostgreSQL Integration**: Full database support with proper media file handling
- **REST API Endpoints**: Complete CRUD operations for documents with QR codes
- **Swagger Documentation**: All endpoints documented and testable via Swagger UI

### React Frontend
- **Document Management Page**: View all documents with their QR codes
- **Document Upload**: Create new documents with automatic QR code generation
- **OCR Integration**: Save OCR results as documents with QR codes
- **QR Code Display**: Visual QR code images that link to document URLs

## Installation & Setup

### 1. Install Dependencies

```bash
cd my_project
pip install psycopg2-binary qrcode[pil]
```

### 2. Database Setup

#### Option A: Use Existing PostgreSQL Database
Ensure PostgreSQL is running on `localhost:5432` with:
- Database name: `docmanager`
- Username: `postgres`
- Password: `admin`

#### Option B: Create New Database
```sql
CREATE DATABASE docmanager;
CREATE USER postgres WITH PASSWORD 'admin';
GRANT ALL PRIVILEGES ON DATABASE docmanager TO postgres;
```

### 3. Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. Create Media Directories

```bash
mkdir -p media/documents
mkdir -p media/qrcodes
```

### 5. Start Django Server

```bash
python manage.py runserver
```

### 6. Start React Frontend

```bash
cd ../proj-stage-frontend
npm install
npm start
```

## API Endpoints

### Document Management

#### List/Create Documents
- **GET** `/api/documents/` - List all documents with QR codes
- **POST** `/api/documents/` - Create new document with automatic QR code

#### Document Details
- **GET** `/api/documents/{id}/` - Get specific document
- **PUT** `/api/documents/{id}/` - Update document
- **DELETE** `/api/documents/{id}/` - Delete document and files

#### QR Code Access
- **GET** `/api/documents/{id}/qrcode/` - Get QR code image (PNG)

#### System Information
- **GET** `/api/qr-codes/info/` - Get QR code system capabilities

### OCR Endpoints (Existing)
- **POST** `/api/ocr/extract/` - Extract text from images/PDFs
- **POST** `/api/ocr/extract-detailed/` - Extract with positioning data
- **GET** `/api/ocr/info/` - OCR system information

## Usage Workflow

### 1. Direct Document Upload
1. Navigate to `/documents` in React app
2. Click "Upload Document"
3. Enter title and select file
4. Document is created with automatic QR code generation
5. QR code appears in document list

### 2. OCR to Document Workflow
1. Navigate to `/ocr` in React app
2. Upload image/PDF and process with OCR
3. Review extracted text in editor
4. Click "Save as Document with QR Code"
5. Document is saved with QR code linking to document URL

### 3. QR Code Usage
- QR codes link to: `http://localhost:8000/documents/{id}/`
- Scan with mobile device to access document
- Click QR code in UI to open in new tab
- QR codes are 300x300px PNG images

## File Structure

### Django Backend Files
```
my_project/
├── my_app/
│   ├── models.py              # Document model with QR code field
│   ├── views.py               # Document & QR code API views
│   ├── serializers.py         # Document serializers
│   ├── urls.py                # API URL patterns
│   └── utils/
│       └── qrcode_generator.py # QR code generation utilities
├── my_project/
│   ├── settings.py            # PostgreSQL & media configuration
│   └── urls.py                # Main URL patterns with media serving
├── media/
│   ├── documents/             # Uploaded document files
│   └── qrcodes/               # Generated QR code images
└── requirements.txt           # Updated dependencies
```

### React Frontend Files
```
proj-stage-frontend/
├── src/
│   ├── services/
│   │   └── documentService.js # Document management API calls
│   ├── pages/
│   │   ├── DocumentsPage.js   # Document list & management
│   │   ├── DocumentsPage.css  # Document page styling
│   │   └── OCRPage.js         # Updated with save document feature
│   └── App.js                 # Updated with documents route
```

## Database Schema

### Document Model
```python
class Document(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/')
    qr_code = models.ImageField(upload_to='qrcodes/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

## QR Code Technical Details

### Generation Process
1. Document is created and saved to get ID
2. QR code URL is generated: `http://localhost:8000/documents/{id}/`
3. QR code image is created using `qrcode` library
4. Image is saved to `media/qrcodes/` directory
5. Document's `qr_code` field is updated with image path

### QR Code Specifications
- **Format**: PNG
- **Size**: 300x300 pixels
- **Error Correction**: Low (~7%)
- **Border**: 4 boxes
- **Colors**: Black on white background

## Testing with Swagger

1. Open `http://127.0.0.1:8000/swagger/`
2. Test document creation:
   - Use `POST /api/documents/` endpoint
   - Upload file and provide title
   - Check response for QR code URL
3. Test QR code retrieval:
   - Use `GET /api/documents/{id}/qrcode/` endpoint
   - Should return PNG image

## Troubleshooting

### Common Issues

#### PostgreSQL Connection Error
```
django.core.exceptions.ImproperlyConfigured: Error loading psycopg2 or psycopg module
```
**Solution**: Install PostgreSQL adapter
```bash
pip install psycopg2-binary
```

#### QR Code Generation Error
```
ModuleNotFoundError: No module named 'qrcode'
```
**Solution**: Install QR code library
```bash
pip install qrcode[pil]
```

#### Media Files Not Serving
**Solution**: Ensure `DEBUG=True` and media URLs are configured in `urls.py`

#### Migration Issues
**Solution**: Reset migrations if needed
```bash
python manage.py migrate my_app zero
python manage.py makemigrations my_app
python manage.py migrate
```

## Security Considerations

### Production Deployment
- Set `DEBUG=False` in production
- Use proper web server (nginx/Apache) for media file serving
- Implement authentication for document access
- Add HTTPS for secure QR code URLs
- Consider rate limiting for QR code generation

### File Upload Security
- Validate file types and sizes
- Scan uploads for malware
- Use secure file storage (AWS S3, etc.)
- Implement access controls

## Performance Optimization

### QR Code Generation
- QR codes are generated synchronously during document creation
- For high-volume applications, consider:
  - Async task queues (Celery)
  - Caching generated QR codes
  - Lazy QR code generation

### Database
- Add indexes on frequently queried fields
- Consider database connection pooling
- Implement query optimization

## Future Enhancements

### Potential Features
1. **Custom QR Code Styling**: Colors, logos, custom designs
2. **QR Code Analytics**: Track scans and usage
3. **Batch QR Code Generation**: Process multiple documents
4. **QR Code Expiration**: Time-limited access URLs
5. **Mobile App Integration**: Dedicated QR scanner app
6. **Multi-format Support**: SVG, PDF QR codes
7. **Document Versioning**: QR codes for specific versions

### Integration Ideas
1. **Email Integration**: Send QR codes via email
2. **Print Integration**: Include QR codes in printed documents
3. **Webhook Support**: Notify external systems of QR code creation
4. **API Rate Limiting**: Prevent abuse of QR code generation
5. **Document Templates**: Pre-configured QR code layouts

## Support

For issues or questions:
1. Check Django logs: `python manage.py runserver` output
2. Check React console: Browser developer tools
3. Verify database connectivity
4. Test API endpoints via Swagger UI
5. Check file permissions for media directories

## License

This implementation follows the same license as your existing project.
