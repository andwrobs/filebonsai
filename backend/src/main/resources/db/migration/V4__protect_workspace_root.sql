CREATE OR REPLACE FUNCTION reject_catalog_root_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.parent_id IS NULL AND OLD.claim_kind = 'entry' THEN
        RAISE EXCEPTION 'workspace root cannot be moved or deleted'
            USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER catalog_root_cannot_move_or_delete
    BEFORE DELETE OR UPDATE OF workspace_id, parent_id, claim_kind, entry_id ON catalog_names
    FOR EACH ROW EXECUTE FUNCTION reject_catalog_root_change();
