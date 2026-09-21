package com.filebonsai.access;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record6;
import org.jooq.impl.DSL;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("postgres")
public class LocalOwnerAccess {
    static final String SESSION_COOKIE = "FILEBONSAI_SESSION";
    static final String CSRF_COOKIE = "FILEBONSAI_CSRF";
    static final String CSRF_HEADER = "X-CSRF-TOKEN";

    private static final org.jooq.Table<?> PRINCIPALS = DSL.table(DSL.name("access_principals"));
    private static final org.jooq.Table<?> OWNER = DSL.table(DSL.name("access_local_owner"));
    private static final org.jooq.Table<?> SESSIONS = DSL.table(DSL.name("access_sessions"));
    private static final org.jooq.Table<?> CREDENTIAL_RESETS = DSL.table(DSL.name("access_credential_resets"));
    private static final org.jooq.Table<?> WORKSPACES = DSL.table(DSL.name("workspaces"));
    private static final org.jooq.Table<?> MEMBERS = DSL.table(DSL.name("workspace_members"));
    private static final org.jooq.Table<?> ENTRIES = DSL.table(DSL.name("catalog_entries"));
    private static final org.jooq.Table<?> NAMES = DSL.table(DSL.name("catalog_names"));
    private static final org.jooq.Field<UUID> ID = DSL.field(DSL.name("id"), UUID.class);
    private static final org.jooq.Field<UUID> PRINCIPAL_ID = DSL.field(DSL.name("principal_id"), UUID.class);
    private static final org.jooq.Field<UUID> WORKSPACE_ID = DSL.field(DSL.name("workspace_id"), UUID.class);
    private static final org.jooq.Field<UUID> PARENT_ID = DSL.field(DSL.name("parent_id"), UUID.class);
    private static final org.jooq.Field<UUID> ENTRY_ID = DSL.field(DSL.name("entry_id"), UUID.class);
    private static final org.jooq.Field<String> ROLE = DSL.field(DSL.name("role"), String.class);
    private static final org.jooq.Field<String> KIND = DSL.field(DSL.name("kind"), String.class);
    private static final org.jooq.Field<String> NAME = DSL.field(DSL.name("name"), String.class);
    private static final org.jooq.Field<String> CLAIM_KIND = DSL.field(DSL.name("claim_kind"), String.class);
    private static final org.jooq.Field<String> PASSWORD_HASH = DSL.field(DSL.name("password_hash"), String.class);
    private static final org.jooq.Field<Long> CREDENTIAL_REVISION =
            DSL.field(DSL.name("credential_revision"), Long.class);
    private static final org.jooq.Field<UUID> SESSION_ID = DSL.field(DSL.name("id"), UUID.class);
    private static final org.jooq.Field<byte[]> TOKEN_HASH = DSL.field(DSL.name("token_hash"), byte[].class);
    private static final org.jooq.Field<byte[]> CSRF_HASH = DSL.field(DSL.name("csrf_hash"), byte[].class);
    private static final org.jooq.Field<OffsetDateTime> EXPIRES_AT =
            DSL.field(DSL.name("expires_at"), OffsetDateTime.class);
    private static final org.jooq.Field<OffsetDateTime> REVOKED_AT =
            DSL.field(DSL.name("revoked_at"), OffsetDateTime.class);
    private static final org.jooq.Field<OffsetDateTime> CREATED_AT =
            DSL.field(DSL.name("created_at"), OffsetDateTime.class);
    private static final org.jooq.Field<OffsetDateTime> UPDATED_AT =
            DSL.field(DSL.name("updated_at"), OffsetDateTime.class);
    private static final org.jooq.Field<Integer> FAILED_LOGIN_ATTEMPTS =
            DSL.field(DSL.name("failed_login_attempts"), Integer.class);
    private static final org.jooq.Field<OffsetDateTime> FAILED_LOGIN_WINDOW_STARTED_AT =
            DSL.field(DSL.name("failed_login_window_started_at"), OffsetDateTime.class);
    private static final org.jooq.Field<OffsetDateTime> LOGIN_BLOCKED_UNTIL =
            DSL.field(DSL.name("login_blocked_until"), OffsetDateTime.class);
    private static final org.jooq.Field<UUID> RESET_REQUEST_ID = DSL.field(DSL.name("request_id"), UUID.class);
    private static final org.jooq.Field<OffsetDateTime> APPLIED_AT =
            DSL.field(DSL.name("applied_at"), OffsetDateTime.class);

    private final DSLContext database;
    private final PasswordHasher passwords;
    private final Clock clock;
    private final Duration sessionTtl;
    private final int maxLoginAttempts;
    private final Duration loginAttemptWindow;
    private final Duration loginLockout;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public LocalOwnerAccess(
            DSLContext database,
            PasswordHasher passwords,
            @Value("${filebonsai.access.session-ttl:PT12H}") Duration sessionTtl,
            @Value("${filebonsai.access.login.max-attempts:5}") int maxLoginAttempts,
            @Value("${filebonsai.access.login.attempt-window:PT5M}") Duration loginAttemptWindow,
            @Value("${filebonsai.access.login.lockout:PT15M}") Duration loginLockout) {
        this(database, passwords, Clock.systemUTC(), sessionTtl, maxLoginAttempts, loginAttemptWindow, loginLockout);
    }

    LocalOwnerAccess(DSLContext database, PasswordHasher passwords, Clock clock, Duration sessionTtl) {
        this(database, passwords, clock, sessionTtl, 5, Duration.ofMinutes(5), Duration.ofMinutes(15));
    }

    LocalOwnerAccess(
            DSLContext database,
            PasswordHasher passwords,
            Clock clock,
            Duration sessionTtl,
            int maxLoginAttempts,
            Duration loginAttemptWindow,
            Duration loginLockout) {
        this.database = database;
        this.passwords = passwords;
        this.clock = clock;
        this.sessionTtl = sessionTtl;
        this.maxLoginAttempts = maxLoginAttempts;
        this.loginAttemptWindow = loginAttemptWindow;
        this.loginLockout = loginLockout;
        if (sessionTtl.isNegative() || sessionTtl.isZero()) {
            throw new IllegalArgumentException("Session TTL must be positive");
        }
        if (maxLoginAttempts < 1
                || loginAttemptWindow.isNegative()
                || loginAttemptWindow.isZero()
                || loginLockout.isNegative()
                || loginLockout.isZero()) {
            throw new IllegalArgumentException("Login throttling settings must be positive");
        }
    }

    @Transactional
    public void bootstrap(char[] password) {
        try {
            requirePassword(password);
            if (database.fetchExists(database.selectOne().from(OWNER))) {
                throw new IllegalStateException("A local owner is already configured");
            }
            UUID principalId = UUID.randomUUID();
            UUID workspaceId = UUID.randomUUID();
            UUID rootId = UUID.randomUUID();
            OffsetDateTime now = OffsetDateTime.now(clock);
            database.insertInto(PRINCIPALS)
                    .columns(DSL.field(DSL.name("id"), UUID.class))
                    .values(principalId)
                    .execute();
            database.insertInto(OWNER)
                    .columns(
                            DSL.field(DSL.name("singleton"), Boolean.class),
                            PRINCIPAL_ID,
                            PASSWORD_HASH,
                            CREDENTIAL_REVISION)
                    .values(true, principalId, passwords.hash(password), 1L)
                    .execute();
            database.insertInto(WORKSPACES)
                    .columns(ID, CREATED_AT)
                    .values(workspaceId, now)
                    .execute();
            database.insertInto(MEMBERS)
                    .columns(WORKSPACE_ID, PRINCIPAL_ID, ROLE, CREATED_AT)
                    .values(workspaceId, principalId, "owner", now)
                    .execute();
            database.insertInto(ENTRIES)
                    .columns(ID, WORKSPACE_ID, KIND, CREATED_AT, UPDATED_AT)
                    .values(rootId, workspaceId, "folder", now, now)
                    .execute();
            database.insertInto(NAMES)
                    .columns(ID, WORKSPACE_ID, PARENT_ID, NAME, CLAIM_KIND, ENTRY_ID, CREATED_AT)
                    .values(UUID.randomUUID(), workspaceId, null, "Library", "entry", rootId, now)
                    .execute();
        } finally {
            clear(password);
        }
    }

    public IssuedSession login(char[] password, String sessionTokenToRotate) {
        try {
            requireLoginPassword(password);
            LoginResult result = database.transactionResult(configuration -> {
                DSLContext transaction = DSL.using(configuration);
                OffsetDateTime now = OffsetDateTime.now(clock);
                Record6<UUID, String, Long, Integer, OffsetDateTime, OffsetDateTime> owner = transaction
                        .select(
                                PRINCIPAL_ID,
                                PASSWORD_HASH,
                                CREDENTIAL_REVISION,
                                FAILED_LOGIN_ATTEMPTS,
                                FAILED_LOGIN_WINDOW_STARTED_AT,
                                LOGIN_BLOCKED_UNTIL)
                        .from(OWNER)
                        .forUpdate()
                        .fetchOne();
                if (owner == null) {
                    return LoginResult.failure(AccessFailure.Reason.INVALID_CREDENTIALS, 0);
                }
                if (owner.value6() != null && owner.value6().isAfter(now)) {
                    return LoginResult.failure(
                            AccessFailure.Reason.RATE_LIMITED, retryAfterSeconds(now, owner.value6()));
                }
                if (!passwords.matches(password, owner.value2())) {
                    return recordFailedLogin(transaction, owner, now);
                }
                clearLoginFailures(transaction);
                if (sessionTokenToRotate != null) {
                    revoke(transaction, sessionTokenToRotate);
                }
                return LoginResult.success(issue(transaction, owner.value1(), owner.value3()));
            });
            if (result.failure() != null) {
                throw new AccessFailure(result.failure(), result.retryAfterSeconds());
            }
            return result.session();
        } finally {
            clear(password);
        }
    }

    public void resetCredentials(UUID requestId, char[] password) {
        try {
            if (requestId == null) {
                throw new IllegalArgumentException("Credential reset request ID is required");
            }
            requirePassword(password);
            database.transaction(configuration -> {
                DSLContext transaction = DSL.using(configuration);
                var owner =
                        transaction.select(PRINCIPAL_ID).from(OWNER).forUpdate().fetchOne();
                if (owner == null) {
                    throw new IllegalStateException("A local owner is not configured");
                }
                String appliedPasswordHash = transaction
                        .select(PASSWORD_HASH)
                        .from(CREDENTIAL_RESETS)
                        .where(RESET_REQUEST_ID.eq(requestId))
                        .fetchOne(PASSWORD_HASH);
                if (appliedPasswordHash != null) {
                    if (!passwords.matches(password, appliedPasswordHash)) {
                        throw new IllegalStateException("Credential reset request conflicts with an existing request");
                    }
                    return;
                }
                String passwordHash = passwords.hash(password);
                OffsetDateTime now = OffsetDateTime.now(clock);
                transaction
                        .update(OWNER)
                        .set(PASSWORD_HASH, passwordHash)
                        .set(CREDENTIAL_REVISION, CREDENTIAL_REVISION.plus(1L))
                        .set(FAILED_LOGIN_ATTEMPTS, 0)
                        .set(FAILED_LOGIN_WINDOW_STARTED_AT, (OffsetDateTime) null)
                        .set(LOGIN_BLOCKED_UNTIL, (OffsetDateTime) null)
                        .execute();
                transaction
                        .update(SESSIONS)
                        .set(REVOKED_AT, now)
                        .where(PRINCIPAL_ID.eq(owner.value1()))
                        .and(REVOKED_AT.isNull())
                        .execute();
                transaction
                        .insertInto(CREDENTIAL_RESETS)
                        .columns(RESET_REQUEST_ID, PRINCIPAL_ID, PASSWORD_HASH, APPLIED_AT)
                        .values(requestId, owner.value1(), passwordHash, now)
                        .execute();
            });
        } finally {
            clear(password);
        }
    }

    public Optional<AuthenticatedPrincipal> authenticate(String sessionToken) {
        if (sessionToken == null) {
            return Optional.empty();
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        var session = database.select(SESSION_ID, PRINCIPAL_ID, CREDENTIAL_REVISION)
                .from(SESSIONS)
                .where(TOKEN_HASH.eq(digest(sessionToken)))
                .and(REVOKED_AT.isNull())
                .and(EXPIRES_AT.gt(now))
                .fetchOne();
        if (session == null || !credentialIsCurrent(session.value2(), session.value3())) {
            return Optional.empty();
        }
        return Optional.of(new AuthenticatedPrincipal(session.value2(), session.value1()));
    }

    public boolean csrfMatches(AuthenticatedPrincipal principal, String csrfToken) {
        if (csrfToken == null) {
            return false;
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        byte[] expected = database.select(CSRF_HASH)
                .from(SESSIONS)
                .where(SESSION_ID.eq(principal.sessionId()))
                .and(PRINCIPAL_ID.eq(principal.id()))
                .and(REVOKED_AT.isNull())
                .and(EXPIRES_AT.gt(now))
                .fetchOne(CSRF_HASH);
        return expected != null && MessageDigest.isEqual(expected, digest(csrfToken));
    }

    public java.time.Instant expiresAt(AuthenticatedPrincipal principal) {
        OffsetDateTime expiry = database.select(EXPIRES_AT)
                .from(SESSIONS)
                .where(SESSION_ID.eq(principal.sessionId()))
                .and(PRINCIPAL_ID.eq(principal.id()))
                .and(REVOKED_AT.isNull())
                .fetchOne(EXPIRES_AT);
        if (expiry == null) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        return expiry.toInstant();
    }

    public String newAnonymousCsrfToken() {
        return token();
    }

    public boolean anonymousCsrfMatches(String csrfCookie, String csrfHeader) {
        return csrfCookie != null
                && csrfHeader != null
                && MessageDigest.isEqual(
                        csrfCookie.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        csrfHeader.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }

    @Transactional
    public void logout(AuthenticatedPrincipal principal) {
        database.update(SESSIONS)
                .set(REVOKED_AT, OffsetDateTime.now(clock))
                .where(SESSION_ID.eq(principal.sessionId()))
                .and(PRINCIPAL_ID.eq(principal.id()))
                .and(REVOKED_AT.isNull())
                .execute();
    }

    private IssuedSession issue(DSLContext transaction, UUID principalId, long credentialRevision) {
        String sessionToken = token();
        String csrfToken = token();
        UUID sessionId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime expires = now.plus(sessionTtl);
        transaction
                .insertInto(SESSIONS)
                .columns(SESSION_ID, PRINCIPAL_ID, CREDENTIAL_REVISION, TOKEN_HASH, CSRF_HASH, CREATED_AT, EXPIRES_AT)
                .values(
                        sessionId,
                        principalId,
                        credentialRevision,
                        digest(sessionToken),
                        digest(csrfToken),
                        now,
                        expires)
                .execute();
        return new IssuedSession(
                new AuthenticatedPrincipal(principalId, sessionId), sessionToken, csrfToken, expires.toInstant());
    }

    private void revoke(DSLContext transaction, String sessionToken) {
        transaction
                .update(SESSIONS)
                .set(REVOKED_AT, OffsetDateTime.now(clock))
                .where(TOKEN_HASH.eq(digest(sessionToken)))
                .and(REVOKED_AT.isNull())
                .execute();
    }

    private LoginResult recordFailedLogin(
            DSLContext transaction,
            Record6<UUID, String, Long, Integer, OffsetDateTime, OffsetDateTime> owner,
            OffsetDateTime now) {
        OffsetDateTime windowStarted = owner.value5();
        int attempts = owner.value4();
        if (windowStarted == null || !now.isBefore(windowStarted.plus(loginAttemptWindow))) {
            windowStarted = now;
            attempts = 1;
        } else {
            attempts++;
        }
        OffsetDateTime blockedUntil = attempts >= maxLoginAttempts ? now.plus(loginLockout) : null;
        transaction
                .update(OWNER)
                .set(FAILED_LOGIN_ATTEMPTS, attempts)
                .set(FAILED_LOGIN_WINDOW_STARTED_AT, windowStarted)
                .set(LOGIN_BLOCKED_UNTIL, blockedUntil)
                .execute();
        if (blockedUntil != null) {
            return LoginResult.failure(AccessFailure.Reason.RATE_LIMITED, retryAfterSeconds(now, blockedUntil));
        }
        return LoginResult.failure(AccessFailure.Reason.INVALID_CREDENTIALS, 0);
    }

    private void clearLoginFailures(DSLContext transaction) {
        transaction
                .update(OWNER)
                .set(FAILED_LOGIN_ATTEMPTS, 0)
                .set(FAILED_LOGIN_WINDOW_STARTED_AT, (OffsetDateTime) null)
                .set(LOGIN_BLOCKED_UNTIL, (OffsetDateTime) null)
                .execute();
    }

    private long retryAfterSeconds(OffsetDateTime now, OffsetDateTime blockedUntil) {
        return Math.max(1, Duration.between(now, blockedUntil).toSeconds());
    }

    private boolean credentialIsCurrent(UUID principalId, long sessionRevision) {
        Long current = database.select(CREDENTIAL_REVISION)
                .from(OWNER)
                .where(PRINCIPAL_ID.eq(principalId))
                .fetchOne(CREDENTIAL_REVISION);
        return current != null && current == sessionRevision;
    }

    private void requirePassword(char[] password) {
        if (password == null || password.length < 12 || password.length > 1024) {
            throw new IllegalArgumentException("Password must contain between 12 and 1024 characters");
        }
    }

    private void requireLoginPassword(char[] password) {
        if (password == null || password.length == 0 || password.length > 1024) {
            throw new AccessFailure(AccessFailure.Reason.INVALID_CREDENTIALS);
        }
    }

    private void clear(char[] password) {
        if (password != null) {
            Arrays.fill(password, '\0');
        }
    }

    private String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private byte[] digest(String token) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }

    private record LoginResult(IssuedSession session, AccessFailure.Reason failure, long retryAfterSeconds) {
        static LoginResult success(IssuedSession session) {
            return new LoginResult(session, null, 0);
        }

        static LoginResult failure(AccessFailure.Reason failure, long retryAfterSeconds) {
            return new LoginResult(null, failure, retryAfterSeconds);
        }
    }
}
