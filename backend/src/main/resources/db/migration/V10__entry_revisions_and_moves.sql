-- Decision 0012: entries carry a revision that changes with their name, parent, trash state or
-- current version, and mutations whose result is not one entry store it as JSON for replay.
ALTER TABLE catalog_entries
    ADD COLUMN revision bigint NOT NULL DEFAULT 1,
    ADD CONSTRAINT ck_catalog_entries_revision CHECK (revision >= 1);

ALTER TABLE idempotency_records
    ALTER COLUMN response_entry_id DROP NOT NULL,
    ADD COLUMN result jsonb,
    ADD CONSTRAINT ck_idempotency_records_result
        CHECK ((response_entry_id IS NULL) <> (result IS NULL));

-- Writers lock an entry before its name. The share lock makes a name write that skipped that
-- order wait for an uncommitted entry change instead of copying values that are about to change.
CREATE OR REPLACE FUNCTION copy_catalog_name_sort_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.entry_kind := NULL;
    NEW.entry_updated_at := NULL;
    NEW.entry_size_bytes := NULL;
    IF NEW.claim_kind = 'entry' THEN
        PERFORM 1
        FROM catalog_entries entry
        WHERE entry.workspace_id = NEW.workspace_id
          AND entry.id = NEW.entry_id
        FOR SHARE;
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
