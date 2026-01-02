# Generated manually to remove custom Group and UserGroup models

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('my_app', '0007_add_groups'),
    ]

    operations = [
        # Drop the custom tables directly via SQL
        migrations.RunSQL(
            "DROP TABLE IF EXISTS my_app_usergroup CASCADE;",
            reverse_sql="-- Cannot reverse this operation"
        ),
        migrations.RunSQL(
            "DROP TABLE IF EXISTS my_app_group CASCADE;",
            reverse_sql="-- Cannot reverse this operation"
        ),
    ]
