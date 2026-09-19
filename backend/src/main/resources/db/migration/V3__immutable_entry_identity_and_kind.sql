CREATE TRIGGER catalog_entry_identity_and_kind_are_immutable
    BEFORE UPDATE OF id, workspace_id, kind, created_at ON catalog_entries
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

ALTER TABLE catalog_names
    ADD CONSTRAINT ck_catalog_names_domain_rules CHECK (
        name NOT IN ('.', '..')
        AND strpos(name, '/') = 0
        AND strpos(name, chr(92)) = 0
        AND name !~ '[[:cntrl:]]'
    );

CREATE OR REPLACE FUNCTION enforce_catalog_root_folder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_id IS NULL AND NOT EXISTS (
        SELECT 1
        FROM catalog_entries root_entry
        WHERE root_entry.workspace_id = NEW.workspace_id
          AND root_entry.id = NEW.entry_id
          AND root_entry.kind = 'folder'
    ) THEN
        RAISE EXCEPTION 'catalog root must be a folder entry'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_root_must_be_folder
    BEFORE INSERT OR UPDATE OF workspace_id, parent_id, claim_kind, entry_id ON catalog_names
    FOR EACH ROW EXECUTE FUNCTION enforce_catalog_root_folder();

CREATE INDEX ix_idempotency_records_expiry
    ON idempotency_records (expires_at);
