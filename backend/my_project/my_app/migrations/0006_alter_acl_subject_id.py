from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('my_app', '0005_remove_document_file'),
	]

	operations = [
		migrations.AlterField(
			model_name='acl',
			name='subject_id',
			field=models.TextField(),
		),
	]


