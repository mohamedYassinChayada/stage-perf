from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('my_app', '0004_search_tsv_triggers'),
	]

	operations = [
		migrations.RemoveField(
			model_name='document',
			name='file',
		),
	]


