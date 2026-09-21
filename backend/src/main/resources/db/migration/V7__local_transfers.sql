ALTER TABLE physical_objects
    ADD COLUMN sha256 bytea;

CREATE OR REPLACE FUNCTION reject_catalog_root_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.parent_id IS NULL AND OLD.claim_kind = 'entry' THEN
        RAISE EXCEPTION 'workspace root cannot be moved or deleted'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TABLE upload_sessions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    entry_id uuid NOT NULL,
    version_id uuid NOT NULL,
    object_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    intent_hash bytea NOT NULL,
    expected_size_bytes bigint NOT NULL,
    expected_sha256 bytea,
    computed_sha256 bytea,
    state varchar(16) NOT NULL,
    fence bigint NOT NULL DEFAULT 0,
    active_attempt_id uuid,
    recovery_claim_id uuid,
    accepted_temp_key varchar(512),
    storage_key varchar(512) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_upload_sessions_idempotency
        UNIQUE (workspace_id, principal_id, idempotency_key),
    CONSTRAINT uq_upload_sessions_entry UNIQUE (entry_id),
    CONSTRAINT uq_upload_sessions_version UNIQUE (version_id),
    CONSTRAINT uq_upload_sessions_object UNIQUE (object_id),
    CONSTRAINT fk_upload_sessions_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_upload_sessions_parent
        FOREIGN KEY (workspace_id, parent_id)
        REFERENCES catalog_entries (workspace_id, id),
    CONSTRAINT ck_upload_sessions_size CHECK (expected_size_bytes >= 0),
    CONSTRAINT ck_upload_sessions_time CHECK (expires_at > created_at AND updated_at >= created_at),
    CONSTRAINT ck_upload_sessions_state CHECK (state IN (
        'INITIATED', 'RECEIVING', 'STAGED', 'FINALIZING', 'RECONCILING',
        'AVAILABLE', 'CANCELLED', 'EXPIRED', 'FAILED'
    )),
    CONSTRAINT ck_upload_sessions_digest CHECK (
        (expected_sha256 IS NULL OR octet_length(expected_sha256) = 32)
        AND (computed_sha256 IS NULL OR octet_length(computed_sha256) = 32)
    ),
    CONSTRAINT ck_upload_sessions_attempt CHECK (
        (state = 'RECEIVING' AND active_attempt_id IS NOT NULL)
        OR (state <> 'RECEIVING' AND active_attempt_id IS NULL)
    ),
    CONSTRAINT ck_upload_sessions_staged CHECK (
        state NOT IN ('STAGED', 'FINALIZING', 'RECONCILING', 'AVAILABLE')
        OR computed_sha256 IS NOT NULL
    )
);

CREATE INDEX ix_upload_sessions_recovery
    ON upload_sessions (state, expires_at);

CREATE INDEX ix_upload_sessions_available_entry
    ON upload_sessions (workspace_id, entry_id)
    WHERE state = 'AVAILABLE';
