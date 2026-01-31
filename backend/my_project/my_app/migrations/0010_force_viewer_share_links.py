"""
Data migration to force all share links to VIEWER role for security.
"""

from django.db import migrations


def force_viewer_share_links(apps, schema_editor):
    ShareLink = apps.get_model('my_app', 'ShareLink')
    ACL = apps.get_model('my_app', 'ACL')

    # Downgrade all share links to VIEWER
    ShareLink.objects.exclude(role='VIEWER').update(role='VIEWER')

    # Downgrade all ACL entries for share links to VIEWER
    ACL.objects.filter(subject_type='share_link').exclude(role='VIEWER').update(role='VIEWER')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('my_app', '0009_qr_code_to_binary_field'),
    ]

    operations = [
        migrations.RunPython(force_viewer_share_links, noop),
    ]
