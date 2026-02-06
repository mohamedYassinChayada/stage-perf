from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('my_app', '0013_cleanup_old_group_models'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='avatar',
            field=models.TextField(blank=True, null=True),
        ),
    ]
