BEGIN;

-- Task 2.11: current logo metadata remains mutable for the application-native
-- upload/replacement feature at Task 4.1a. The original Access import evidence
-- is kept separately and is immutable, so replacing a current logo can never
-- erase what was migrated.

DO $PRECONDITION$
BEGIN
    IF (SELECT count(*) FROM public.client_logos) <> 0 THEN
        RAISE EXCEPTION 'Task 2.11 schema migration requires an empty client_logos target';
    END IF;
END
$PRECONDITION$;

ALTER TABLE public.client_logos
    ALTER COLUMN sha256 SET NOT NULL,
    ADD CONSTRAINT client_logos_relative_path_shape CHECK (
        relative_path ~ '^[1-9][0-9]*/[^/\\]+$'
        AND relative_path = client_id::text || '/' || file_name),
    ADD CONSTRAINT client_logos_file_name_shape CHECK (
        file_name <> ''
        AND file_name !~ '[/\\]'
        AND file_name !~ '[[:cntrl:]]'
        AND file_name NOT IN ('.','..')
        AND file_name !~ '[. ]$'
        AND file_name !~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$'),
    ADD CONSTRAINT client_logos_content_type_shape CHECK (
        content_type IN ('image/gif','image/jpeg','image/png')),
    ADD CONSTRAINT client_logos_byte_size_shape CHECK (byte_size > 0),
    ADD CONSTRAINT client_logos_sha256_shape CHECK (sha256 ~ '^[0-9a-f]{64}$');

CREATE TABLE public.migration_client_logo_import (
    source_parent_key integer PRIMARY KEY,
    client_id integer NOT NULL UNIQUE,
    client_logo_id integer NOT NULL UNIQUE,
    source_record_key text NOT NULL UNIQUE,
    source_extraction_sha256 text NOT NULL,
    source_stored_path text NOT NULL UNIQUE,
    source_file_name text NOT NULL,
    detected_content_type text NOT NULL,
    byte_size integer NOT NULL,
    sha256 text NOT NULL,
    destination_relative_path text NOT NULL UNIQUE,
    complex_csv_sha256 text NOT NULL,
    imported_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT migration_client_logo_import_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT migration_client_logo_import_identity_shape CHECK (
        source_parent_key > 0
        AND client_id > 0
        AND client_logo_id > 0
        AND source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND source_extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT migration_client_logo_import_file_shape CHECK (
        source_file_name <> ''
        AND source_file_name !~ '[/\\]'
        AND source_file_name !~ '[[:cntrl:]]'
        AND source_file_name NOT IN ('.','..')
        AND source_file_name !~ '[. ]$'
        AND detected_content_type IN ('image/gif','image/jpeg','image/png')
        AND byte_size > 0
        AND sha256 ~ '^[0-9a-f]{64}$'
        AND complex_csv_sha256 ~ '^[0-9a-f]{64}$'
        AND destination_relative_path = client_id::text || '/' || source_file_name)
);

CREATE OR REPLACE FUNCTION public.refuse_client_logo_import_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $CLIENT_LOGO_IMPORT$
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.11 immutable client-logo import evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.11 client-logo import evidence DELETE/TRUNCATE is refused';
END;
$CLIENT_LOGO_IMPORT$;

CREATE TRIGGER migration_client_logo_import_no_change
    BEFORE UPDATE OR DELETE ON public.migration_client_logo_import
    FOR EACH ROW EXECUTE FUNCTION public.refuse_client_logo_import_change();
CREATE TRIGGER migration_client_logo_import_no_truncate
    BEFORE TRUNCATE ON public.migration_client_logo_import
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_client_logo_import_change();

COMMIT;
