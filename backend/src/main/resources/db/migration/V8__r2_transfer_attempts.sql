CREATE UNIQUE INDEX uq_upload_sessions_storage_key ON upload_sessions (storage_key);

CREATE TABLE r2_attempts (
    id uuid PRIMARY KEY,
    logical_key varchar(512) NOT NULL,
    provider_key varchar(512) NOT NULL UNIQUE,
    upload_id varchar(1024),
    state varchar(16) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
    updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
    CONSTRAINT ck_r2_attempt_state CHECK (state IN (
        'INITIATING', 'UPLOADING', 'COMPLETING', 'VERIFYING', 'VERIFIED', 'RETIRED'
    ))
);

CREATE INDEX ix_r2_attempts_logical_key ON r2_attempts (logical_key, created_at DESC);
CREATE INDEX ix_r2_attempts_retired ON r2_attempts (state, created_at);

CREATE TABLE r2_parts (
    attempt_id uuid NOT NULL REFERENCES r2_attempts (id),
    part_number integer NOT NULL,
    etag varchar(128) NOT NULL,
    size_bytes bigint NOT NULL,
    PRIMARY KEY (attempt_id, part_number),
    CONSTRAINT ck_r2_part_number CHECK (part_number BETWEEN 1 AND 10000),
    CONSTRAINT ck_r2_part_size CHECK (size_bytes > 0)
);

CREATE TABLE r2_objects (
    logical_key varchar(512) PRIMARY KEY,
    attempt_id uuid NOT NULL UNIQUE REFERENCES r2_attempts (id),
    size_bytes bigint NOT NULL,
    sha256 bytea NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
    CONSTRAINT ck_r2_object_size CHECK (size_bytes >= 0),
    CONSTRAINT ck_r2_object_digest CHECK (octet_length(sha256) = 32)
);
