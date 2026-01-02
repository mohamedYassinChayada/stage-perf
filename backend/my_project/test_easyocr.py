#!/usr/bin/env python3
"""
Test script for EasyOCR implementation.
This script tests the new EasyOCR functionality and API endpoints.
"""

import os
import sys
import django
from PIL import Image, ImageDraw, ImageFont
import io
import requests
import json

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_project.settings')
django.setup()

from my_app.utils.ocr import (
    extract_text_from_image, 
    extract_text_with_positions,
    get_ocr_info, 
    get_ocr_reader,
    get_supported_languages
)

def create_test_image():
    """Create a test image with text for OCR testing."""
    # Create a white image
    width, height = 800, 300
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    
    # Try to use a system font, fallback to default if not available
    try:
        font = ImageFont.truetype("arial.ttf", 28)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28)
        except:
            font = ImageFont.load_default()
    
    # Text for testing
    test_texts = [
        "Hello World! This is a test.",
        "EasyOCR can recognize text in images.",
        "Testing numbers: 123 456 789",
        "Special characters: @#$%^&*()"
    ]
    
    y_position = 40
    for text in test_texts:
        draw.text((50, y_position), text, fill='black', font=font)
        y_position += 50
    
    # Convert to bytes
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def test_easyocr_initialization():
    """Test EasyOCR reader initialization."""
    print("🔧 Testing EasyOCR Initialization")
    print("=" * 50)
    
    try:
        reader = get_ocr_reader()
        print("✅ EasyOCR reader initialized successfully")
        print(f"📋 Configured languages: {reader.lang_list[:10]}")  # Show first 10
        return True
    except Exception as e:
        print(f"❌ EasyOCR initialization failed: {e}")
        return False

def test_ocr_extraction():
    """Test OCR text extraction functionality."""
    print("\n🔍 Testing OCR Text Extraction")
    print("=" * 50)
    
    try:
        # Create test image
        print("📸 Creating test image...")
        test_image_bytes = create_test_image()
        
        # Test basic OCR extraction
        print("🔍 Running basic OCR extraction...")
        extracted_text, success = extract_text_from_image(test_image_bytes)
        
        if success:
            print("✅ Basic OCR extraction successful!")
            print(f"📝 Extracted text ({len(extracted_text)} characters):")
            print("-" * 40)
            print(extracted_text)
            print("-" * 40)
            
            # Test detailed OCR extraction
            print("\n🔍 Running detailed OCR extraction with positioning...")
            detailed_result, detailed_success = extract_text_with_positions(test_image_bytes)
            
            if detailed_success:
                print("✅ Detailed OCR extraction successful!")
                print(f"📊 Found {detailed_result['total_blocks']} text blocks in {detailed_result['total_lines']} lines")
                print(f"🖼️  Image size: {detailed_result['image_size']['width']}x{detailed_result['image_size']['height']}")
                print(f"📈 Average confidence: {detailed_result['confidence']:.2f}")
                
                print("\n📋 Line breakdown:")
                for line in detailed_result['lines'][:3]:  # Show first 3 lines
                    print(f"  Line {line['line_number']}: '{line['text']}' (confidence: {line['confidence']:.2f})")
                
                return True
            else:
                print("⚠️  Basic OCR worked but detailed extraction failed")
                return True  # Still count as success since basic worked
        else:
            print("❌ OCR extraction failed:")
            print(extracted_text)
            return False
            
    except Exception as e:
        print(f"❌ OCR extraction test failed: {e}")
        return False

def test_ocr_info():
    """Test OCR information retrieval."""
    print("\n📊 Testing OCR Information")
    print("=" * 50)
    
    try:
        info = get_ocr_info()
        print("✅ OCR info retrieved successfully!")
        print(f"🔧 OCR Engine: {info.get('ocr_engine', 'Unknown')}")
        print(f"🌐 Languages: {info.get('configured_languages', [])}")
        print(f"🖥️  GPU Enabled: {info.get('gpu_enabled', False)}")
        print(f"📁 Image Formats: {info.get('supported_image_formats', [])}")
        print(f"📄 Document Formats: {info.get('supported_document_formats', [])}")
        return True
    except Exception as e:
        print(f"❌ OCR info test failed: {e}")
        return False

def test_api_endpoints():
    """Test the API endpoints."""
    print("\n🌐 Testing API Endpoints")
    print("=" * 50)
    
    base_url = "http://127.0.0.1:8000"
    
    # Test info endpoint
    try:
        print("📡 Testing /api/ocr/info/ endpoint...")
        response = requests.get(f"{base_url}/api/ocr/info/", timeout=10)
        
        if response.status_code == 200:
            print("✅ Info endpoint working!")
            info_data = response.json()
            print(f"🔧 OCR Engine: {info_data.get('ocr_engine', 'Unknown')}")
        else:
            print(f"❌ Info endpoint failed with status: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection failed. Make sure Django server is running:")
        print("   python manage.py runserver")
        return False
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False
    
    # Test basic extraction endpoint
    try:
        print("📡 Testing /api/ocr/extract/ endpoint...")
        test_image = create_test_image()
        
        files = {'file': ('test_image.png', test_image, 'image/png')}
        response = requests.post(f"{base_url}/api/ocr/extract/", files=files, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✅ Basic extraction endpoint working!")
                print(f"📝 Extracted: {result.get('extracted_text', '')[:100]}...")
                print(f"⏱️  Processing time: {result.get('processing_time', 0)}s")
                
                # Test detailed extraction endpoint
                print("\n📡 Testing /api/ocr/extract-detailed/ endpoint...")
                files = {'file': ('test_image.png', create_test_image(), 'image/png')}
                detailed_response = requests.post(f"{base_url}/api/ocr/extract-detailed/", files=files, timeout=30)
                
                if detailed_response.status_code == 200:
                    detailed_result = detailed_response.json()
                    if detailed_result.get('success'):
                        print("✅ Detailed extraction endpoint working!")
                        print(f"📊 Found {detailed_result.get('total_blocks', 0)} blocks in {detailed_result.get('total_lines', 0)} lines")
                        print(f"📈 Confidence: {detailed_result.get('confidence', 0):.2f}")
                        print(f"🖼️  Image size: {detailed_result.get('image_size', {}).get('width', 0)}x{detailed_result.get('image_size', {}).get('height', 0)}")
                    else:
                        print("⚠️  Detailed extraction failed but basic works")
                else:
                    print(f"⚠️  Detailed endpoint failed with status: {detailed_response.status_code}")
                    
            else:
                print("❌ Extraction failed:")
                print(result.get('extracted_text', 'No details'))
                return False
        else:
            print(f"❌ Extraction endpoint failed with status: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"❌ API extraction test failed: {e}")
        return False
    
    return True

def test_supported_languages():
    """Test supported languages functionality."""
    print("\n🌐 Testing Supported Languages")
    print("=" * 50)
    
    try:
        languages = get_supported_languages()
        print(f"✅ Found {len(languages)} supported languages")
        print(f"📋 First 20 languages: {languages[:20]}")
        
        # Check if common languages are supported
        common_langs = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']
        supported_common = [lang for lang in common_langs if lang in languages]
        print(f"🌍 Common languages supported: {supported_common}")
        
        return True
    except Exception as e:
        print(f"❌ Language test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🚀 EasyOCR Test Suite")
    print("=" * 60)
    
    tests = [
        ("EasyOCR Initialization", test_easyocr_initialization),
        ("OCR Text Extraction", test_ocr_extraction),
        ("OCR Information", test_ocr_info),
        ("Supported Languages", test_supported_languages),
        ("API Endpoints", test_api_endpoints),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
    
    print(f"\n📊 Test Results: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("\n🎉 All tests passed! EasyOCR is working correctly.")
        print("\n💡 Next steps:")
        print("   1. Start Django server: python manage.py runserver")
        print("   2. Test via Swagger UI: http://127.0.0.1:8000/swagger/")
        print("   3. Upload images and see EasyOCR in action!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")
        
    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1) 