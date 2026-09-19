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
import org.jooq.Record3;
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
    private static final org.jooq.Field<UUID> PRINCIPAL_ID = DSL.field(DSL.name("principal_id"), UUID.class);
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

    private final DSLContext database;
    private final PasswordHasher passwords;
    private final Clock clock;
    private final Duration sessionTtl;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public LocalOwnerAccess(
            DSLContext database,
            PasswordHasher passwords,
            @Value("${filebonsai.access.session-ttl:PT12H}") Duration sessionTtl) {
        this(database, passwords, Clock.systemUTC(), sessionTtl);
    }

    LocalOwnerAccess(DSLContext database, PasswordHasher passwords, Clock clock, Duration sessionTtl) {
        this.database = database;
        this.passwords = passwords;
        this.clock = clock;
        this.sessionTtl = sessionTtl;
        if (sessionTtl.isNegative() || sessionTtl.isZero()) {
            throw new IllegalArgumentException("Session TTL must be positive");
        }
    }

    @Transactional
    public void bootstrap(char[] password) {
        requirePassword(password);
        try {
            if (database.fetchExists(database.selectOne().from(OWNER))) {
                throw new IllegalStateException("A local owner is already configured");
            }
            UUID principalId = UUID.randomUUID();
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
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    public IssuedSession login(char[] password, String sessionTokenToRotate) {
        requirePassword(password);
        try {
            Record3<UUID, String, Long> owner = database.select(PRINCIPAL_ID, PASSWORD_HASH, CREDENTIAL_REVISION)
                    .from(OWNER)
                    .fetchOne();
            if (owner == null || !passwords.matches(password, owner.value2())) {
                throw new AccessFailure(AccessFailure.Reason.INVALID_CREDENTIALS);
            }
            return database.transactionResult(configuration -> {
                DSLContext transaction = DSL.using(configuration);
                if (sessionTokenToRotate != null) {
                    revoke(transaction, sessionTokenToRotate);
                }
                return issue(transaction, owner.value1(), owner.value3());
            });
        } finally {
            Arrays.fill(password, '\0');
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
}
