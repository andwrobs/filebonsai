CREATE TABLE workspaces (
    id uuid PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspace_members (
    workspace_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    role varchar(32) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_workspace_members PRIMARY KEY (workspace_id, principal_id),
    CONSTRAINT fk_workspace_members_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT ck_workspace_members_role CHECK (role IN ('owner', 'member'))
);

CREATE TABLE catalog_entries (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    kind varchar(16) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_catalog_entries_workspace_id UNIQUE (workspace_id, id),
    CONSTRAINT fk_catalog_entries_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT ck_catalog_entries_kind CHECK (kind IN ('file', 'folder')),
    CONSTRAINT ck_catalog_entries_time CHECK (updated_at >= created_at)
);

CREATE TABLE catalog_names (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    parent_id uuid,
    name varchar(255) NOT NULL,
    claim_kind varchar(16) NOT NULL,
    entry_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_catalog_names_entry UNIQUE (entry_id),
    CONSTRAINT fk_catalog_names_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT fk_catalog_names_parent
        FOREIGN KEY (workspace_id, parent_id)
        REFERENCES catalog_entries (workspace_id, id),
    CONSTRAINT fk_catalog_names_entry
        FOREIGN KEY (workspace_id, entry_id)
        REFERENCES catalog_entries (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_catalog_names_claim CHECK (
        (claim_kind = 'entry' AND entry_id IS NOT NULL AND expires_at IS NULL)
        OR (
            claim_kind = 'reservation'
            AND parent_id IS NOT NULL
            AND entry_id IS NULL
            AND expires_at IS NOT NULL
        )
    )
);

CREATE TABLE physical_objects (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    storage_key varchar(512) NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_physical_objects_storage_key UNIQUE (storage_key),
    CONSTRAINT uq_physical_objects_workspace_id UNIQUE (workspace_id, id),
    CONSTRAINT fk_physical_objects_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT ck_physical_objects_size CHECK (size_bytes >= 0)
);

CREATE TABLE file_versions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    object_id uuid NOT NULL,
    ordinal bigint NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_file_versions_entry_ordinal UNIQUE (entry_id, ordinal),
    CONSTRAINT uq_file_versions_entry_id UNIQUE (entry_id, id),
    CONSTRAINT fk_file_versions_entry
        FOREIGN KEY (workspace_id, entry_id)
        REFERENCES catalog_entries (workspace_id, id),
    CONSTRAINT fk_file_versions_object
        FOREIGN KEY (workspace_id, object_id)
        REFERENCES physical_objects (workspace_id, id),
    CONSTRAINT ck_file_versions_ordinal CHECK (ordinal > 0),
    CONSTRAINT ck_file_versions_size CHECK (size_bytes >= 0)
);

ALTER TABLE catalog_entries
    ADD COLUMN current_version_id uuid;

ALTER TABLE catalog_entries
    ADD CONSTRAINT fk_catalog_entries_current_version
    FOREIGN KEY (id, current_version_id)
    REFERENCES file_versions (entry_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE catalog_entries
    ADD CONSTRAINT ck_catalog_entries_current_version
    CHECK (
        (kind = 'file' AND current_version_id IS NOT NULL)
        OR (kind = 'folder' AND current_version_id IS NULL)
    );

CREATE TABLE idempotency_records (
    workspace_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    operation varchar(64) NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash bytea NOT NULL,
    response_entry_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_idempotency_records
        PRIMARY KEY (workspace_id, principal_id, operation, idempotency_key),
    CONSTRAINT fk_idempotency_records_member
        FOREIGN KEY (workspace_id, principal_id)
        REFERENCES workspace_members (workspace_id, principal_id) ON DELETE CASCADE,
    CONSTRAINT fk_idempotency_records_response
        FOREIGN KEY (workspace_id, response_entry_id)
        REFERENCES catalog_entries (workspace_id, id),
    CONSTRAINT ck_idempotency_records_time CHECK (expires_at > created_at)
);
