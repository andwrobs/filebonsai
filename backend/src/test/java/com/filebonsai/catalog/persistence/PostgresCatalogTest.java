package com.filebonsai.catalog.persistence;

import static com.filebonsai.catalog.persistence.jooq.Tables.CATALOG_ENTRIES;
import static com.filebonsai.catalog.persistence.jooq.Tables.CATALOG_NAMES;
import static com.filebonsai.catalog.persistence.jooq.Tables.FILE_VERSIONS;
import static com.filebonsai.catalog.persistence.jooq.Tables.IDEMPOTENCY_RECORDS;
import static com.filebonsai.catalog.persistence.jooq.Tables.PHYSICAL_OBJECTS;
import static com.filebonsai.catalog.persistence.jooq.Tables.WORKSPACES;
import static com.filebonsai.catalog.persistence.jooq.Tables.WORKSPACE_MEMBERS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.persistence.jooq.DefaultSchema;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.SQLDialect;
import org.jooq.exception.DataAccessException;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class PostgresCatalogTest {
    private static final UUID WORKSPACE = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID PRINCIPAL = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final EntryId ROOT = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000001"));
    private static final EntryId FILE = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000002"));
    private static final UUID VERSION = UUID.fromString("30000000-0000-4000-8000-000000000001");
    private static final UUID OBJECT = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private static final Instant NOW = Instant.parse("2026-02-01T00:00:00Z");

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    private static HikariDataSource dataSource;
    private static DSLContext database;

    private final CatalogScope scope = new CatalogScope(PRINCIPAL, WORKSPACE);
    private PostgresCatalog catalog;

    @BeforeAll
    static void migrate() {
        var hikari = new HikariConfig();
        hikari.setJdbcUrl(POSTGRES.getJdbcUrl());
        hikari.setUsername(POSTGRES.getUsername());
        hikari.setPassword(POSTGRES.getPassword());
        hikari.setMaximumPoolSize(12);
        dataSource = new HikariDataSource(hikari);
        Flyway.configure().dataSource(dataSource).load().migrate();
        database = DSL.using(dataSource, SQLDialect.POSTGRES);
    }

    @AfterAll
    static void closePool() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @BeforeEach
    void setup() {
        database.execute("truncate table idempotency_records, catalog_names, file_versions,"
                + " physical_objects, catalog_entries, workspace_members, workspaces cascade");
        seed();
        catalog = catalog();
    }

    @Test
    void readsTypedEntriesAndHidesOtherScopes() {
        assertThat(catalog.get(scope, ROOT)).isInstanceOf(Entry.Folder.class);
        Entry.File file = (Entry.File) catalog.get(scope, FILE);
        assertThat(file.currentVersion().sizeBytes().decimal()).isEqualTo("9007199254740993");
        assertReason(
                () -> catalog.get(new CatalogScope(UUID.randomUUID(), WORKSPACE), ROOT),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(
                () -> catalog.get(new CatalogScope(PRINCIPAL, UUID.randomUUID()), ROOT),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
    }

    @Test
    void pagesInPostgresqlUtf8Order() {
        Entry.Folder parent = create(ROOT, "Paging");
        create(parent.id(), "A");
        create(parent.id(), "C");
        create(parent.id(), "\uE000");
        create(parent.id(), "😀");

        var first = catalog.list(scope, parent.id(), 1, null);
        assertThat(first.entries()).extracting(entry -> entry.name().value()).containsExactly("A");
        create(parent.id(), "0");
        create(parent.id(), "B");
        assertThat(catalog.list(scope, parent.id(), 100, first.nextCursor()).entries())
                .extracting(entry -> entry.name().value())
                .containsExactly("B", "C", "\uE000", "😀");
    }

    @Test
    void pendingReservationSharesTheSiblingNamespaceAndFailureRollsBack() {
        OffsetDateTime now = database.fetchValue(DSL.field("current_timestamp", OffsetDateTime.class));
        database.insertInto(CATALOG_NAMES)
                .columns(
                        CATALOG_NAMES.ID,
                        CATALOG_NAMES.WORKSPACE_ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_NAMES.CLAIM_KIND,
                        CATALOG_NAMES.ENTRY_ID,
                        CATALOG_NAMES.EXPIRES_AT,
                        CATALOG_NAMES.CREATED_AT)
                .values(
                        UUID.randomUUID(),
                        WORKSPACE,
                        ROOT.value(),
                        "pending-upload.bin",
                        "reservation",
                        null,
                        now.plusHours(1),
                        now)
                .execute();
        int before = database.fetchCount(CATALOG_ENTRIES);

        assertReason(() -> create(ROOT, "pending-upload.bin"), CatalogFailure.Reason.NAME_CONFLICT);
        assertThat(database.fetchCount(CATALOG_ENTRIES)).isEqualTo(before);
        assertThat(database.fetchCount(IDEMPOTENCY_RECORDS)).isZero();
    }

    @Test
    void expiredReservationReleasesTheName() {
        OffsetDateTime now = database.fetchValue(DSL.field("current_timestamp", OffsetDateTime.class));
        database.insertInto(CATALOG_NAMES)
                .columns(
                        CATALOG_NAMES.ID,
                        CATALOG_NAMES.WORKSPACE_ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_NAMES.CLAIM_KIND,
                        CATALOG_NAMES.ENTRY_ID,
                        CATALOG_NAMES.EXPIRES_AT,
                        CATALOG_NAMES.CREATED_AT)
                .values(
                        UUID.randomUUID(),
                        WORKSPACE,
                        ROOT.value(),
                        "expired.bin",
                        "reservation",
                        null,
                        now.minusSeconds(1),
                        now.minusHours(1))
                .execute();

        Entry.Folder created = create(ROOT, "expired.bin");

        assertThat(created.name().value()).isEqualTo("expired.bin");
        assertThat(database.fetchCount(
                        CATALOG_NAMES,
                        CATALOG_NAMES.PARENT_ID.eq(ROOT.value()).and(CATALOG_NAMES.NAME.eq("expired.bin"))))
                .isEqualTo(1);
    }

    @Test
    void idempotencySurvivesAdapterRestart() {
        UUID key = UUID.randomUUID();
        Entry.Folder first = catalog.create(scope, ROOT, new FileName("Durable"), key);
        PostgresCatalog restarted = catalog();

        assertThat(restarted.create(scope, ROOT, new FileName("Durable"), key)).isEqualTo(first);
        assertReason(
                () -> restarted.create(scope, ROOT, new FileName("Changed"), key),
                CatalogFailure.Reason.IDEMPOTENCY_CONFLICT);
        assertThat(database.fetchCount(IDEMPOTENCY_RECORDS)).isEqualTo(1);
    }

    @Test
    void expiredIdempotencyRecordDoesNotClaimTheKey() {
        UUID key = UUID.randomUUID();
        OffsetDateTime now = database.fetchValue(DSL.field("current_timestamp", OffsetDateTime.class));
        database.insertInto(IDEMPOTENCY_RECORDS)
                .columns(
                        IDEMPOTENCY_RECORDS.WORKSPACE_ID,
                        IDEMPOTENCY_RECORDS.PRINCIPAL_ID,
                        IDEMPOTENCY_RECORDS.OPERATION,
                        IDEMPOTENCY_RECORDS.IDEMPOTENCY_KEY,
                        IDEMPOTENCY_RECORDS.REQUEST_HASH,
                        IDEMPOTENCY_RECORDS.RESPONSE_ENTRY_ID,
                        IDEMPOTENCY_RECORDS.CREATED_AT,
                        IDEMPOTENCY_RECORDS.EXPIRES_AT)
                .values(
                        WORKSPACE,
                        PRINCIPAL,
                        "create-folder",
                        key,
                        new byte[32],
                        ROOT.value(),
                        now.minusDays(31),
                        now.minusDays(1))
                .execute();

        Entry.Folder created = catalog.create(scope, ROOT, new FileName("Reused key"), key);

        assertThat(created.name().value()).isEqualTo("Reused key");
        assertThat(database.fetchCount(IDEMPOTENCY_RECORDS)).isEqualTo(1);
        assertThat(database.select(IDEMPOTENCY_RECORDS.RESPONSE_ENTRY_ID)
                        .from(IDEMPOTENCY_RECORDS)
                        .where(IDEMPOTENCY_RECORDS.IDEMPOTENCY_KEY.eq(key))
                        .fetchOne(IDEMPOTENCY_RECORDS.RESPONSE_ENTRY_ID))
                .isEqualTo(created.id().value());
    }

    @Test
    void concurrentSameKeyReturnsOneIdentity() throws Exception {
        UUID key = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<Callable<Entry.Folder>>();
            for (int index = 0; index < 12; index++) {
                jobs.add(() -> catalog.create(scope, ROOT, new FileName("Concurrent"), key));
            }
            Set<EntryId> identities = new HashSet<>();
            for (var result : executor.invokeAll(jobs)) {
                identities.add(result.get().id());
            }
            assertThat(identities).hasSize(1);
        }
    }

    @Test
    void concurrentDifferentKeysAllowOnlyOneNameOwner() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<Callable<Boolean>>();
            for (int index = 0; index < 12; index++) {
                jobs.add(() -> {
                    try {
                        create(ROOT, "Contended");
                        return true;
                    } catch (CatalogFailure exception) {
                        assertThat(exception.reason()).isEqualTo(CatalogFailure.Reason.NAME_CONFLICT);
                        return false;
                    }
                });
            }
            int successes = 0;
            for (var result : executor.invokeAll(jobs)) {
                if (result.get()) {
                    successes++;
                }
            }
            assertThat(successes).isEqualTo(1);
        }
    }

    @Test
    void versionsAndObjectMetadataAreImmutable() {
        assertThatThrownBy(() -> database.update(FILE_VERSIONS)
                        .set(FILE_VERSIONS.SIZE_BYTES, 1L)
                        .where(FILE_VERSIONS.ID.eq(VERSION))
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("55000"));
        assertThatThrownBy(() -> database.update(PHYSICAL_OBJECTS)
                        .set(PHYSICAL_OBJECTS.STORAGE_KEY, "renamed")
                        .where(PHYSICAL_OBJECTS.ID.eq(OBJECT))
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("55000"));
        assertThatThrownBy(() -> database.update(CATALOG_ENTRIES)
                        .set(CATALOG_ENTRIES.KIND, "folder")
                        .setNull(CATALOG_ENTRIES.CURRENT_VERSION_ID)
                        .where(CATALOG_ENTRIES.ID.eq(FILE.value()))
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("55000"));
    }

    @Test
    void databaseRejectsChildrenOfFilesAndMismatchedObjectSizes() {
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        assertThatThrownBy(() -> database.insertInto(CATALOG_NAMES)
                        .columns(
                                CATALOG_NAMES.ID,
                                CATALOG_NAMES.WORKSPACE_ID,
                                CATALOG_NAMES.PARENT_ID,
                                CATALOG_NAMES.NAME,
                                CATALOG_NAMES.CLAIM_KIND,
                                CATALOG_NAMES.ENTRY_ID,
                                CATALOG_NAMES.EXPIRES_AT,
                                CATALOG_NAMES.CREATED_AT)
                        .values(
                                UUID.randomUUID(),
                                WORKSPACE,
                                FILE.value(),
                                "invalid",
                                "reservation",
                                null,
                                now.plusHours(1),
                                now)
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("23514"));
        assertThatThrownBy(() -> database.insertInto(FILE_VERSIONS)
                        .columns(
                                FILE_VERSIONS.ID,
                                FILE_VERSIONS.WORKSPACE_ID,
                                FILE_VERSIONS.ENTRY_ID,
                                FILE_VERSIONS.OBJECT_ID,
                                FILE_VERSIONS.ORDINAL,
                                FILE_VERSIONS.SIZE_BYTES,
                                FILE_VERSIONS.CREATED_AT)
                        .values(UUID.randomUUID(), WORKSPACE, FILE.value(), OBJECT, 2L, 1L, now)
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("23514"));
    }

    @Test
    void databaseRejectsInvalidNames() {
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        for (String invalid : List.of(".", "..", "a/b", "a\\b", "control\u0007")) {
            assertThatThrownBy(() -> database.insertInto(CATALOG_NAMES)
                            .columns(
                                    CATALOG_NAMES.ID,
                                    CATALOG_NAMES.WORKSPACE_ID,
                                    CATALOG_NAMES.PARENT_ID,
                                    CATALOG_NAMES.NAME,
                                    CATALOG_NAMES.CLAIM_KIND,
                                    CATALOG_NAMES.ENTRY_ID,
                                    CATALOG_NAMES.EXPIRES_AT,
                                    CATALOG_NAMES.CREATED_AT)
                            .values(
                                    UUID.randomUUID(),
                                    WORKSPACE,
                                    ROOT.value(),
                                    invalid,
                                    "reservation",
                                    null,
                                    now.plusHours(1),
                                    now)
                            .execute())
                    .isInstanceOfSatisfying(
                            DataAccessException.class,
                            exception -> assertThat(exception.sqlState()).isEqualTo("23514"));
        }
    }

    @Test
    void databaseProtectsTheWorkspaceRoot() {
        Entry.Folder other = create(ROOT, "Other root candidate");
        assertThatThrownBy(() -> database.update(CATALOG_NAMES)
                        .set(CATALOG_NAMES.PARENT_ID, other.id().value())
                        .where(CATALOG_NAMES.ENTRY_ID.eq(ROOT.value()))
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("55000"));
        assertThatThrownBy(() -> database.deleteFrom(CATALOG_NAMES)
                        .where(CATALOG_NAMES.ENTRY_ID.eq(ROOT.value()))
                        .execute())
                .isInstanceOfSatisfying(
                        DataAccessException.class,
                        exception -> assertThat(exception.sqlState()).isEqualTo("55000"));
    }

    @Test
    void generatedJooqCatalogSchemaMatchesItsOwnedMigratedColumns() {
        Map<String, List<ColumnShape>> generated = new LinkedHashMap<>();
        DefaultSchema.DEFAULT_SCHEMA.getTables().stream()
                .sorted(java.util.Comparator.comparing(org.jooq.Table::getName))
                .forEach(table -> generated.put(
                        table.getName(),
                        java.util.Arrays.stream(table.fields())
                                .sorted(java.util.Comparator.comparing(Field::getName))
                                .map(field -> new ColumnShape(
                                        field.getName(),
                                        normalizeType(field.getDataType().getTypeName()),
                                        field.getDataType().nullable(),
                                        field.getDataType().length(),
                                        field.getDataType().scale()))
                                .sorted()
                                .toList()));

        Map<String, List<ColumnShape>> migrated = new LinkedHashMap<>();
        database.fetch(
                        "select table_name, column_name, data_type, is_nullable, character_maximum_length, numeric_scale "
                                + "from information_schema.columns where table_schema = 'public' "
                                + "and table_name <> 'flyway_schema_history' and table_name not like 'access_%' "
                                + "and table_name <> 'upload_sessions' and table_name not like 'r2_%' "
                                + "and not (table_name = 'physical_objects' and column_name = 'sha256') "
                                + "order by table_name, column_name")
                .forEach(row -> migrated.computeIfAbsent(
                                row.get("table_name", String.class), ignored -> new ArrayList<>())
                        .add(new ColumnShape(
                                row.get("column_name", String.class),
                                row.get("data_type", String.class),
                                "YES".equals(row.get("is_nullable", String.class)),
                                row.get("character_maximum_length", Integer.class) == null
                                        ? 0
                                        : row.get("character_maximum_length", Integer.class),
                                row.get("numeric_scale", Integer.class) == null
                                        ? 0
                                        : row.get("numeric_scale", Integer.class))));

        assertThat(generated).isEqualTo(migrated);
    }

    private record ColumnShape(String name, String type, boolean nullable, int length, int scale)
            implements Comparable<ColumnShape> {
        @Override
        public int compareTo(ColumnShape other) {
            return name.compareTo(other.name);
        }
    }

    private static String normalizeType(String type) {
        return switch (type.toLowerCase()) {
            case "varchar" -> "character varying";
            case "blob" -> "bytea";
            default -> type.toLowerCase();
        };
    }

    private PostgresCatalog catalog() {
        return new PostgresCatalog(database, new CatalogCursor(new ObjectMapper(), new byte[32]));
    }

    private Entry.Folder create(EntryId parent, String name) {
        return catalog.create(scope, parent, new FileName(name), UUID.randomUUID());
    }

    private void seed() {
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        database.insertInto(WORKSPACES).columns(WORKSPACES.ID).values(WORKSPACE).execute();
        database.insertInto(WORKSPACE_MEMBERS)
                .columns(WORKSPACE_MEMBERS.WORKSPACE_ID, WORKSPACE_MEMBERS.PRINCIPAL_ID, WORKSPACE_MEMBERS.ROLE)
                .values(WORKSPACE, PRINCIPAL, "owner")
                .execute();
        database.insertInto(CATALOG_ENTRIES)
                .columns(
                        CATALOG_ENTRIES.ID,
                        CATALOG_ENTRIES.WORKSPACE_ID,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        CATALOG_ENTRIES.CURRENT_VERSION_ID)
                .values(ROOT.value(), WORKSPACE, "folder", now, now, null)
                .execute();
        insertEntryName(ROOT.value(), null, "Library", now);
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            transaction
                    .insertInto(PHYSICAL_OBJECTS)
                    .columns(
                            PHYSICAL_OBJECTS.ID,
                            PHYSICAL_OBJECTS.WORKSPACE_ID,
                            PHYSICAL_OBJECTS.STORAGE_KEY,
                            PHYSICAL_OBJECTS.SIZE_BYTES,
                            PHYSICAL_OBJECTS.CREATED_AT)
                    .values(OBJECT, WORKSPACE, "objects/40/0001", 9007199254740993L, now)
                    .execute();
            transaction
                    .insertInto(CATALOG_ENTRIES)
                    .columns(
                            CATALOG_ENTRIES.ID,
                            CATALOG_ENTRIES.WORKSPACE_ID,
                            CATALOG_ENTRIES.KIND,
                            CATALOG_ENTRIES.CREATED_AT,
                            CATALOG_ENTRIES.UPDATED_AT,
                            CATALOG_ENTRIES.CURRENT_VERSION_ID)
                    .values(FILE.value(), WORKSPACE, "file", now, now, VERSION)
                    .execute();
            transaction
                    .insertInto(FILE_VERSIONS)
                    .columns(
                            FILE_VERSIONS.ID,
                            FILE_VERSIONS.WORKSPACE_ID,
                            FILE_VERSIONS.ENTRY_ID,
                            FILE_VERSIONS.OBJECT_ID,
                            FILE_VERSIONS.ORDINAL,
                            FILE_VERSIONS.SIZE_BYTES,
                            FILE_VERSIONS.CREATED_AT)
                    .values(VERSION, WORKSPACE, FILE.value(), OBJECT, 1L, 9007199254740993L, now)
                    .execute();
            insertEntryName(transaction, FILE.value(), ROOT.value(), "Italy.pdf", now);
        });
    }

    private void insertEntryName(UUID entry, UUID parent, String name, OffsetDateTime now) {
        insertEntryName(database, entry, parent, name, now);
    }

    private void insertEntryName(DSLContext context, UUID entry, UUID parent, String name, OffsetDateTime now) {
        context.insertInto(CATALOG_NAMES)
                .columns(
                        CATALOG_NAMES.ID,
                        CATALOG_NAMES.WORKSPACE_ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_NAMES.CLAIM_KIND,
                        CATALOG_NAMES.ENTRY_ID,
                        CATALOG_NAMES.EXPIRES_AT,
                        CATALOG_NAMES.CREATED_AT)
                .values(UUID.randomUUID(), WORKSPACE, parent, name, "entry", entry, null, now)
                .execute();
    }

    private static void assertReason(Runnable action, CatalogFailure.Reason reason) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        CatalogFailure.class,
                        exception -> assertThat(exception.reason()).isEqualTo(reason));
    }
}
