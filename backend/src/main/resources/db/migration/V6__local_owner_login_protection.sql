ALTER TABLE access_local_owner
    ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN failed_login_window_started_at timestamp with time zone,
    ADD COLUMN login_blocked_until timestamp with time zone,
    ADD CONSTRAINT ck_access_local_owner_failed_attempts CHECK (failed_login_attempts >= 0),
    ADD CONSTRAINT ck_access_local_owner_failure_window CHECK (
        (failed_login_attempts = 0 AND failed_login_window_started_at IS NULL)
        OR (failed_login_attempts > 0 AND failed_login_window_started_at IS NOT NULL)
    ),
    ADD CONSTRAINT ck_access_local_owner_blocked_state CHECK (
        login_blocked_until IS NULL
        OR (
            failed_login_attempts > 0
            AND failed_login_window_started_at IS NOT NULL
            AND login_blocked_until > failed_login_window_started_at
        )
    );

CREATE TABLE access_credential_resets (
    request_id uuid PRIMARY KEY,
    principal_id uuid NOT NULL,
    password_hash varchar(512) NOT NULL,
    applied_at timestamp with time zone NOT NULL,
    CONSTRAINT fk_access_credential_resets_principal
        FOREIGN KEY (principal_id) REFERENCES access_principals (id) ON DELETE CASCADE
);
