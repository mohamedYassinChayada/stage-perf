#!/usr/bin/env python3
"""
Quick test script to validate Django imports and identify issues.
"""

import os
import sys
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_project.settings')

try:
    print("🔧 Setting up Django...")
    django.setup()
    print("✅ Django setup successful!")
    
    print("📦 Testing imports...")
    
    # Test settings import
    from django.conf import settings
    print("✅ Settings imported successfully")
    
    # Test app imports
    from my_app import views
    print("✅ Views imported successfully")
    
    from my_app import urls
    print("✅ URLs imported successfully")
    
    from my_app.utils import ocr
    print("✅ OCR utils imported successfully")
    
    # Test OCR functions
    from my_app.utils.ocr import get_ocr_info
    info = get_ocr_info()
    print(f"✅ OCR info retrieved: {info.get('ocr_engine', 'Unknown')}")
    
    print("\n🎉 All imports successful! Django should start without issues.")
    
except Exception as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1) 