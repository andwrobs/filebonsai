CREATE TABLE access_principals (
    id uuid PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE access_local_owner (
    singleton boolean PRIMARY KEY DEFAULT TRUE,
    principal_id uuid NOT NULL UNIQUE,
    password_hash varchar(512) NOT NULL,
    credential_revision bigint NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_access_local_owner_singleton CHECK (singleton),
    CONSTRAINT ck_access_local_owner_revision CHECK (credential_revision > 0),
    CONSTRAINT fk_access_local_owner_principal
        FOREIGN KEY (principal_id) REFERENCES access_principals (id) ON DELETE CASCADE
);

CREATE TABLE access_sessions (
    id uuid PRIMARY KEY,
    principal_id uuid NOT NULL,
    credential_revision bigint NOT NULL,
    token_hash bytea NOT NULL UNIQUE,
    csrf_hash bytea NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT ck_access_sessions_expiry CHECK (expires_at > created_at),
    CONSTRAINT fk_access_sessions_principal
        FOREIGN KEY (principal_id) REFERENCES access_principals (id) ON DELETE CASCADE
);

CREATE INDEX ix_access_sessions_active
    ON access_sessions (token_hash, expires_at)
    WHERE revoked_at IS NULL;
