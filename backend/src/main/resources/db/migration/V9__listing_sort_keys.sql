-- Folder listings page by index in several orders. The sort keys live on catalog_entries
-- and file_versions, but only catalog_names carries the parent, so each entry claim keeps
-- copies of its entry's kind, updated_at and current version size. Triggers own the
-- copies: any write to a name recomputes them, and entry or version changes refresh them.

ALTER TABLE catalog_names
    ADD COLUMN entry_kind varchar(16),
    ADD COLUMN entry_updated_at timestamp with time zone,
    ADD COLUMN entry_size_bytes bigint;

CREATE OR REPLACE FUNCTION copy_catalog_name_sort_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.entry_kind := NULL;
    NEW.entry_updated_at := NULL;
    NEW.entry_size_bytes := NULL;
    IF NEW.claim_kind = 'entry' THEN
        SELECT entry.kind, entry.updated_at, current_version.size_bytes
        INTO NEW.entry_kind, NEW.entry_updated_at, NEW.entry_size_bytes
        FROM catalog_entries entry
        LEFT JOIN file_versions current_version
            ON current_version.entry_id = entry.id AND current_version.id = entry.current_version_id
        WHERE entry.workspace_id = NEW.workspace_id
          AND entry.id = NEW.entry_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_names_copy_sort_keys
    BEFORE INSERT OR UPDATE ON catalog_names
    FOR EACH ROW EXECUTE FUNCTION copy_catalog_name_sort_keys();

-- The update only needs to touch the row; the trigger above recomputes every copy.
CREATE OR REPLACE FUNCTION refresh_catalog_name_sort_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'file_versions' THEN
        UPDATE catalog_names listed
        SET entry_size_bytes = NULL
        FROM catalog_entries entry
        WHERE entry.workspace_id = NEW.workspace_id
          AND entry.id = NEW.entry_id
          AND entry.current_version_id = NEW.id
          AND listed.entry_id = entry.id
          AND listed.claim_kind = 'entry';
    ELSE
        UPDATE catalog_names
        SET entry_updated_at = NULL
        WHERE entry_id = NEW.id
          AND claim_kind = 'entry';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER catalog_entries_refresh_sort_keys
    AFTER UPDATE OF updated_at, current_version_id ON catalog_entries
    FOR EACH ROW EXECUTE FUNCTION refresh_catalog_name_sort_keys();

-- Publication may point current_version_id at a version inserted later in the transaction.
CREATE TRIGGER file_versions_refresh_sort_keys
    AFTER INSERT ON file_versions
    FOR EACH ROW EXECUTE FUNCTION refresh_catalog_name_sort_keys();

UPDATE catalog_names
SET entry_kind = NULL
WHERE claim_kind = 'entry';

-- Size stays nullable: a name may claim its file before the version row exists in the transaction.
ALTER TABLE catalog_names
    ADD CONSTRAINT ck_catalog_names_sort_keys CHECK (
        claim_kind <> 'entry' OR (entry_kind IS NOT NULL AND entry_updated_at IS NOT NULL)
    );

-- Every order ends in name bytes, then UUID. Ascending and descending share an index.
-- Size sorts a folder as -1, below any file; its children stay ordered by name.
CREATE INDEX ix_catalog_names_page_folders_first
    ON catalog_names (workspace_id, parent_id, entry_kind, name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';

CREATE INDEX ix_catalog_names_page_updated
    ON catalog_names (workspace_id, parent_id, entry_updated_at, name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';

CREATE INDEX ix_catalog_names_page_updated_folders_first
    ON catalog_names (workspace_id, parent_id, entry_kind, entry_updated_at, name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';

CREATE INDEX ix_catalog_names_page_size
    ON catalog_names (workspace_id, parent_id, (coalesce(entry_size_bytes, -1)), name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';
