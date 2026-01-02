from django.db import migrations


SEARCH_FUNCTION_SQL = r'''
CREATE OR REPLACE FUNCTION my_app_update_document_search_tsv() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.text,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION my_app_update_version_search_tsv() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', coalesce(NEW.text,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_search_tsv ON my_app_document;
CREATE TRIGGER trg_document_search_tsv
BEFORE INSERT OR UPDATE OF title, text ON my_app_document
FOR EACH ROW EXECUTE FUNCTION my_app_update_document_search_tsv();

DROP TRIGGER IF EXISTS trg_document_version_search_tsv ON my_app_documentversion;
CREATE TRIGGER trg_document_version_search_tsv
BEFORE INSERT OR UPDATE OF text ON my_app_documentversion
FOR EACH ROW EXECUTE FUNCTION my_app_update_version_search_tsv();

-- Initial backfill
UPDATE my_app_document SET search_tsv = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(text,''));
UPDATE my_app_documentversion SET search_tsv = to_tsvector('english', coalesce(text,''));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_search_tsv ON my_app_document USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_documentversion_search_tsv ON my_app_documentversion USING GIN (search_tsv);
'''


REVERSE_SQL = r'''
DROP INDEX IF EXISTS idx_documentversion_search_tsv;
DROP INDEX IF EXISTS idx_document_search_tsv;
DROP TRIGGER IF EXISTS trg_document_version_search_tsv ON my_app_documentversion;
DROP TRIGGER IF EXISTS trg_document_search_tsv ON my_app_document;
DROP FUNCTION IF EXISTS my_app_update_version_search_tsv();
DROP FUNCTION IF EXISTS my_app_update_document_search_tsv();
'''


class Migration(migrations.Migration):

	dependencies = [
		('my_app', '0003_label_remove_document_html_content_and_more'),
	]

	operations = [
		migrations.RunSQL(SEARCH_FUNCTION_SQL, REVERSE_SQL),
	]


