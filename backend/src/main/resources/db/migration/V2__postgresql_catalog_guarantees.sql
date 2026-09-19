ALTER TABLE catalog_names
    ADD CONSTRAINT ck_catalog_names_utf8_bytes CHECK (octet_length(name) BETWEEN 1 AND 255),
    ADD CONSTRAINT ck_catalog_names_nfc CHECK (name = normalize(name, NFC));

CREATE UNIQUE INDEX uq_catalog_names_sibling
    ON catalog_names (workspace_id, parent_id, name COLLATE "C")
    WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX uq_catalog_names_root
    ON catalog_names (workspace_id)
    WHERE parent_id IS NULL AND claim_kind = 'entry';

CREATE INDEX ix_catalog_names_page
    ON catalog_names (workspace_id, parent_id, name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';

CREATE OR REPLACE FUNCTION enforce_catalog_name_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM catalog_entries parent
        WHERE parent.workspace_id = NEW.workspace_id
          AND parent.id = NEW.parent_id
          AND parent.kind = 'folder'
    ) THEN
        RAISE EXCEPTION 'catalog parent must be a folder'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_name_parent_must_be_folder
    BEFORE INSERT OR UPDATE OF workspace_id, parent_id ON catalog_names
    FOR EACH ROW EXECUTE FUNCTION enforce_catalog_name_parent();

CREATE OR REPLACE FUNCTION enforce_file_version_object()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    object_size bigint;
    entry_kind varchar(16);
BEGIN
    SELECT size_bytes INTO object_size
    FROM physical_objects
    WHERE workspace_id = NEW.workspace_id AND id = NEW.object_id;

    SELECT kind INTO entry_kind
    FROM catalog_entries
    WHERE workspace_id = NEW.workspace_id AND id = NEW.entry_id;

    IF object_size IS NULL OR object_size <> NEW.size_bytes OR entry_kind IS DISTINCT FROM 'file' THEN
        RAISE EXCEPTION 'file version must match a file entry and immutable object size'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER file_version_must_match_object
    BEFORE INSERT ON file_versions
    FOR EACH ROW EXECUTE FUNCTION enforce_file_version_object();

CREATE OR REPLACE FUNCTION reject_immutable_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'immutable catalog row cannot be changed'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER file_versions_are_immutable
    BEFORE UPDATE OR DELETE ON file_versions
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE TRIGGER physical_objects_are_immutable
    BEFORE UPDATE ON physical_objects
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
