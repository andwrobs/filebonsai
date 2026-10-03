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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.domain.KindFamily;
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
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.SQLDialect;
import org.jooq.conf.ParamType;
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
    void readsTheCurrentDigestAndCountsEveryVersionOfTheEntry() {
        Entry.File legacy = (Entry.File) catalog.get(scope, FILE);
        assertThat(legacy.currentVersion().sha256()).isNull();
        assertThat(legacy.versionCount()).isEqualTo(1);

        byte[] digest = new byte[32];
        digest[0] = (byte) 0xab;
        digest[31] = 0x01;
        UUID object = UUID.randomUUID();
        UUID version = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            transaction
                    .insertInto(PHYSICAL_OBJECTS)
                    .columns(
                            PHYSICAL_OBJECTS.ID,
                            PHYSICAL_OBJECTS.WORKSPACE_ID,
                            PHYSICAL_OBJECTS.STORAGE_KEY,
                            PHYSICAL_OBJECTS.SIZE_BYTES,
                            PHYSICAL_OBJECTS.CREATED_AT,
                            DSL.field(DSL.name("sha256"), byte[].class))
                    .values(object, WORKSPACE, "objects/" + object, 12L, now, digest)
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
                    .values(version, WORKSPACE, FILE.value(), object, 2L, 12L, now)
                    .execute();
            transaction
                    .update(CATALOG_ENTRIES)
                    .set(CATALOG_ENTRIES.CURRENT_VERSION_ID, version)
                    .where(CATALOG_ENTRIES.ID.eq(FILE.value()))
                    .execute();
        });

        String hex = "ab" + "00".repeat(30) + "01";
        Entry.File current = (Entry.File) catalog.get(scope, FILE);
        assertThat(current.currentVersion().id().value()).isEqualTo(version);
        assertThat(current.currentVersion().sha256()).isEqualTo(hex);
        assertThat(current.versionCount()).isEqualTo(2);
        Entry.File listed = catalog.list(scope, ROOT, ListOrder.DEFAULT, 100, null).entries().stream()
                .filter(entry -> entry.id().equals(FILE))
                .map(Entry.File.class::cast)
                .findFirst()
                .orElseThrow();
        assertThat(listed.currentVersion().sha256()).isEqualTo(hex);
        assertThat(listed.versionCount()).isEqualTo(2);
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
    void readsRootToParentAncestryAtDepthsOneTwoAndFiftyWithinTheWorkspace() {
        assertThat(catalog.list(scope, ROOT)).isEmpty();
        Entry.Folder current = create(ROOT, "Level 1");
        assertThat(catalog.list(scope, current.id()))
                .extracting(ancestor -> ancestor.name().value())
                .containsExactly("Library");
        current = create(current.id(), "Level 2");
        assertThat(catalog.list(scope, current.id()))
                .extracting(ancestor -> ancestor.name().value())
                .containsExactly("Library", "Level 1");
        for (int depth = 3; depth <= 50; depth++) {
            current = create(current.id(), "Level " + depth);
        }
        var ancestors = catalog.list(scope, current.id());
        assertThat(ancestors).hasSize(50);
        assertThat(ancestors.getFirst().name().value()).isEqualTo("Library");
        assertThat(ancestors.getLast().name().value()).isEqualTo("Level 49");
        EntryId target = current.id();
        assertReason(
                () -> catalog.list(new CatalogScope(UUID.randomUUID(), WORKSPACE), target),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(
                () -> catalog.list(new CatalogScope(PRINCIPAL, UUID.randomUUID()), target),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(() -> catalog.list(scope, new EntryId(UUID.randomUUID())), CatalogFailure.Reason.ENTRY_NOT_FOUND);
    }

    @Test
    void pagesInPostgresqlUtf8Order() {
        Entry.Folder parent = create(ROOT, "Paging");
        create(parent.id(), "A");
        create(parent.id(), "C");
        create(parent.id(), "\uE000");
        create(parent.id(), "😀");

        var first = catalog.list(scope, parent.id(), ListOrder.DEFAULT, 1, null);
        assertThat(first.entries()).extracting(entry -> entry.name().value()).containsExactly("A");
        create(parent.id(), "0");
        create(parent.id(), "B");
        assertThat(catalog.list(scope, parent.id(), ListOrder.DEFAULT, 100, first.nextCursor())
                        .entries())
                .extracting(entry -> entry.name().value())
                .containsExactly("B", "C", "\uE000", "😀");
    }

    @Test
    void sortKeyCopiesFollowTheirEntryAndVersionInEveryWriteOrder() {
        Entry.Folder parent = create(ROOT, "Copies");
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        // Publication: the reservation becomes an entry claim after the version exists.
        UUID published = UUID.randomUUID();
        UUID reservation = UUID.randomUUID();
        database.execute(
                "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, expires_at,"
                        + " created_at) values (?, ?, ?, 'published.bin', 'reservation', null, ?::timestamptz, ?::timestamptz)",
                reservation,
                WORKSPACE,
                parent.id().value(),
                now.plusHours(1),
                now);
        assertThat(sortKeyDrift()).isZero();
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            UUID version = UUID.randomUUID();
            insertEntry(transaction, published, "file", version, now);
            insertVersion(transaction, published, version, 42, now);
            transaction.execute(
                    "update catalog_names set claim_kind = 'entry', entry_id = ?, expires_at = null where id = ?",
                    published,
                    reservation);
        });
        // A name may also claim the entry before the current version row exists; the FK is deferred.
        UUID early = UUID.randomUUID();
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            UUID version = UUID.randomUUID();
            insertEntry(transaction, early, "file", version, now);
            insertEntryName(transaction, early, parent.id().value(), "early.bin", now);
            insertVersion(transaction, early, version, 7, now);
        });
        assertThat(sortKeyDrift()).isZero();
        assertThat(database.fetchValue("select entry_size_bytes from catalog_names where entry_id = ?", published))
                .isEqualTo(42L);

        database.update(CATALOG_ENTRIES)
                .set(CATALOG_ENTRIES.UPDATED_AT, now.plusDays(1))
                .where(CATALOG_ENTRIES.ID.eq(early))
                .execute();
        database.execute(
                "update catalog_names set entry_kind = 'folder', entry_updated_at = ?::timestamptz, entry_size_bytes = 1"
                        + " where entry_id = ?",
                now.minusDays(1).toString(),
                published);
        assertThat(sortKeyDrift()).isZero();
        assertThat(database.fetchOne("select entry_updated_at from catalog_names where entry_id = ?", early)
                        .get(0, OffsetDateTime.class))
                .isAtSameInstantAs(now.plusDays(1));
    }

    @Test
    void kindRankColumnAgreesWithTheDomainFamilyForEveryExtension() {
        var names = new ArrayList<String>();
        for (KindFamily family : KindFamily.values()) {
            for (String extension : family.extensions()) {
                names.add("x." + extension);
                names.add("x." + extension.toUpperCase(java.util.Locale.ROOT));
                names.add("a.b." + extension);
                names.add(extension);
                names.add("." + extension);
                names.add("x." + extension + ".bak");
            }
        }
        names.addAll(List.of("x", "x.", "..pdf", "x.Pdf", "x.\u212Aey", "x.İmg", "x.jpg ", "photo.JPEG", "😀.mp4"));
        Entry.Folder parent = create(ROOT, "Families");
        for (String name : names) {
            // The catalog stores NFC names, so compare what it would store.
            FileName stored = new FileName(name);
            assertThat(database.fetchValue("select catalog_kind_rank('file', ?)", stored.value()))
                    .as(name)
                    .isEqualTo((short) KindFamily.ofFile(stored).rank());
        }
        // A folder ranks first whatever its name; the column follows renames.
        Entry.Folder folder = create(parent.id(), "Photos.jpg");
        assertThat(database.fetchValue(
                        "select entry_kind_rank from catalog_names where entry_id = ?",
                        folder.id().value()))
                .isEqualTo((short) 0);
        UUID file = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            UUID version = UUID.randomUUID();
            insertEntry(transaction, file, "file", version, now);
            insertVersion(transaction, file, version, 1, now);
            insertEntryName(transaction, file, parent.id().value(), "notes.txt", now);
        });
        assertThat(database.fetchValue("select entry_kind_rank from catalog_names where entry_id = ?", file))
                .isEqualTo((short) KindFamily.TEXT.rank());
        database.execute(
                "update catalog_names set name = 'renamed.PDF' where entry_id = ? and claim_kind = 'entry'", file);
        assertThat(database.fetchValue("select entry_kind_rank from catalog_names where entry_id = ?", file))
                .isEqualTo((short) KindFamily.PDF.rank());
    }

    @Test
    void everyOrderPagesInKeyNameAndIdSequenceWhileEntriesAreInserted() {
        var random = new Random(20260927);
        int folderNumber = 0;
        for (ListOrder order : allOrders()) {
            Entry.Folder parent = create(ROOT, "Order " + folderNumber++);
            Set<UUID> expected = new HashSet<>();
            for (int index = 0; index < 14; index++) {
                expected.add(insertChild(parent.id(), random).id().value());
            }
            var comparator = order.comparator();
            var seen = new ArrayList<ListOrder.Position>();
            String cursor = null;
            do {
                var page = catalog.list(scope, parent.id(), order, 3, cursor);
                page.entries().forEach(entry -> seen.add(order.position(entry)));
                cursor = page.nextCursor();
                if (cursor != null) {
                    // Inserts ahead of the cursor must appear once; inserts behind it are skipped.
                    for (int index = 0; index < 2; index++) {
                        Entry child = insertChild(parent.id(), random);
                        if (comparator.compare(order.position(child), seen.getLast()) > 0) {
                            expected.add(child.id().value());
                        }
                    }
                }
            } while (cursor != null);
            for (int index = 1; index < seen.size(); index++) {
                assertThat(comparator.compare(seen.get(index - 1), seen.get(index)))
                        .as("%s at %d", order, index)
                        .isNegative();
            }
            assertThat(seen).extracting(ListOrder.Position::id).doesNotHaveDuplicates();
            assertThat(seen)
                    .as("%s", order)
                    .extracting(ListOrder.Position::id)
                    .containsExactlyInAnyOrderElementsOf(expected);
        }
    }

    @Test
    void kindFilterPagesOneGroupInEveryOrderWhileEntriesAreInserted() {
        var random = new Random(20260930);
        int folderNumber = 0;
        for (ListOrder order : allOrders()) {
            for (ListChildren.Kind kind : ListChildren.Kind.values()) {
                boolean folders = kind == ListChildren.Kind.FOLDER;
                Entry.Folder parent = create(ROOT, "Kind " + folderNumber++);
                Set<UUID> expected = new HashSet<>();
                for (int index = 0; index < 18; index++) {
                    Entry child = insertChild(parent.id(), random);
                    if ((child instanceof Entry.Folder) == folders) {
                        expected.add(child.id().value());
                    }
                }
                var comparator = order.comparator();
                var seen = new ArrayList<ListOrder.Position>();
                String cursor = null;
                do {
                    var page = catalog.list(scope, parent.id(), order, kind, 3, cursor);
                    page.entries().forEach(entry -> seen.add(order.position(entry)));
                    cursor = page.nextCursor();
                    if (cursor != null) {
                        // Inserts ahead of the cursor must appear once; inserts behind it are skipped.
                        for (int index = 0; index < 2; index++) {
                            Entry child = insertChild(parent.id(), random);
                            if ((child instanceof Entry.Folder) == folders
                                    && comparator.compare(order.position(child), seen.getLast()) > 0) {
                                expected.add(child.id().value());
                            }
                        }
                    }
                } while (cursor != null);
                String description = order + " " + kind;
                assertThat(seen).as(description).allMatch(position -> position.folder() == folders);
                for (int index = 1; index < seen.size(); index++) {
                    assertThat(comparator.compare(seen.get(index - 1), seen.get(index)))
                            .as("%s at %d", description, index)
                            .isNegative();
                }
                assertThat(seen).extracting(ListOrder.Position::id).doesNotHaveDuplicates();
                assertThat(seen)
                        .as(description)
                        .extracting(ListOrder.Position::id)
                        .containsExactlyInAnyOrderElementsOf(expected);
            }
        }
    }

    @Test
    void everyOrderReadsOnlyItsPageFromItsIndexAtTenThousandChildren() throws Exception {
        Entry.Folder parent = create(ROOT, "Large");
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            transaction.execute(
                    "insert into physical_objects (id, workspace_id, storage_key, size_bytes, created_at)"
                            + " select md5('o' || i)::uuid, ?, 'objects/bulk/' || i, (i * 7919) % 100000, ?::timestamptz"
                            + " from generate_series(1, 10000) i where i % 10 <> 0",
                    WORKSPACE, now);
            transaction.execute(
                    "insert into catalog_entries (id, workspace_id, kind, created_at, updated_at, current_version_id)"
                            + " select md5('e' || i)::uuid, ?, case when i % 10 = 0 then 'folder' else 'file' end,"
                            + " ?::timestamptz, ?::timestamptz + ((i * 104729) % 10007) * interval '1 millisecond',"
                            + " case when i % 10 = 0 then null else md5('v' || i)::uuid end"
                            + " from generate_series(1, 10000) i",
                    WORKSPACE, now, now);
            transaction.execute(
                    "insert into file_versions (id, workspace_id, entry_id, object_id, ordinal, size_bytes, created_at)"
                            + " select md5('v' || i)::uuid, ?, md5('e' || i)::uuid, md5('o' || i)::uuid, 1,"
                            + " (i * 7919) % 100000, ?::timestamptz from generate_series(1, 10000) i where i % 10 <> 0",
                    WORKSPACE, now);
            transaction.execute(
                    "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, expires_at,"
                            + " created_at) select md5('n' || i)::uuid, ?, ?, 'child ' || ((i * 31) % 97) || ' ' || i"
                            + " || (array['', '.pdf', '.jpg', '.txt', '.zip', '.mov'])[i % 6 + 1],"
                            + " 'entry', md5('e' || i)::uuid, null, ?::timestamptz from generate_series(1, 10000) i",
                    WORKSPACE, parent.id().value(), now);
        });
        database.execute("analyze catalog_names, catalog_entries, file_versions");
        assertThat(sortKeyDrift()).isZero();

        var mapper = new ObjectMapper();
        for (ListOrder order : allOrders()) {
            List<Boolean> groups =
                    order.foldersFirst() ? List.of(true, false) : java.util.Arrays.asList(null, true, false);
            for (Boolean folders : groups) {
                var first = catalog.pageQuery(database, scope, parent.id(), order, folders, null, 51)
                        .fetch();
                assertThat(first).hasSize(51);
                ListOrder.Position middle = PostgresCatalog.position(order, first.get(49));
                for (ListOrder.Position after : java.util.Arrays.asList(null, middle)) {
                    String sql = catalog.pageQuery(database, scope, parent.id(), order, folders, after, 51)
                            .getSQL(ParamType.INLINED);
                    JsonNode plan = mapper.readTree(database.fetchOne("explain (analyze, format json) " + sql)
                                    .get(0, String.class))
                            .get(0)
                            .get("Plan");
                    var nodes = new ArrayList<JsonNode>();
                    collect(plan, nodes);
                    String description = order + " folders=" + folders + " after=" + (after != null) + " plan "
                            + nodes.stream()
                                    .map(node -> node.path("Node Type").asText() + ":"
                                            + node.path("Index Name").asText())
                                    .toList();
                    assertThat(nodes)
                            .as(description)
                            .extracting(node -> node.path("Node Type").asText())
                            .doesNotContain("Sort", "Incremental Sort", "Seq Scan");
                    // The planner may filter a mostly-matching group from the ungrouped index. Either way the scan
                    // reads, including the rows it filters out, stay within two pages of the 10,000 children.
                    assertThat(nodes)
                            .as(description)
                            .filteredOn(node -> "catalog_names"
                                    .equals(node.path("Relation Name").asText()))
                            .singleElement()
                            .satisfies(node -> {
                                assertThat(node.path("Index Name").asText()).startsWith("ix_catalog_names_page");
                                assertThat(node.path("Actual Rows").asLong()
                                                + node.path("Rows Removed by Filter")
                                                        .asLong())
                                        .isLessThanOrEqualTo(102);
                            });
                }
            }
        }
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
    void sumsCommittedVersionsExactlyAndOnlyForMembersOfTheWorkspace() {
        // The same principal belongs to a second workspace that also holds a committed version.
        UUID otherWorkspace = UUID.fromString("10000000-0000-4000-8000-000000000009");
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        database.insertInto(WORKSPACES)
                .columns(WORKSPACES.ID)
                .values(otherWorkspace)
                .execute();
        database.insertInto(WORKSPACE_MEMBERS)
                .columns(WORKSPACE_MEMBERS.WORKSPACE_ID, WORKSPACE_MEMBERS.PRINCIPAL_ID, WORKSPACE_MEMBERS.ROLE)
                .values(otherWorkspace, PRINCIPAL, "owner")
                .execute();
        UUID otherRoot = UUID.randomUUID();
        UUID otherFile = UUID.randomUUID();
        UUID otherVersion = UUID.randomUUID();
        UUID otherObject = UUID.randomUUID();
        database.insertInto(CATALOG_ENTRIES)
                .columns(
                        CATALOG_ENTRIES.ID,
                        CATALOG_ENTRIES.WORKSPACE_ID,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        CATALOG_ENTRIES.CURRENT_VERSION_ID)
                .values(otherRoot, otherWorkspace, "folder", now, now, null)
                .execute();
        insertEntryName(database, otherWorkspace, otherRoot, null, "Library", now);
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
                    .values(otherObject, otherWorkspace, "objects/40/0009", 7L, now)
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
                    .values(otherFile, otherWorkspace, "file", now, now, otherVersion)
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
                    .values(otherVersion, otherWorkspace, otherFile, otherObject, 1L, 7L, now)
                    .execute();
            insertEntryName(transaction, otherWorkspace, otherFile, otherRoot, "notes.txt", now);
        });

        assertThat(catalog.committedBytes(scope).decimal()).isEqualTo("9007199254740993");
        assertThat(catalog.committedBytes(new CatalogScope(PRINCIPAL, otherWorkspace))
                        .decimal())
                .isEqualTo("7");
        assertThat(catalog.committedBytes(new CatalogScope(UUID.randomUUID(), WORKSPACE))
                        .value())
                .isZero();
        assertThat(catalog.committedBytes(new CatalogScope(PRINCIPAL, UUID.randomUUID()))
                        .value())
                .isZero();
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
                                + "and not (table_name = 'catalog_names' "
                                + "and column_name in ('entry_kind', 'entry_updated_at', 'entry_size_bytes', 'entry_kind_rank')) "
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

    private static List<ListOrder> allOrders() {
        var orders = new ArrayList<ListOrder>();
        for (ListOrder.Key key : ListOrder.Key.values()) {
            for (boolean descending : new boolean[] {false, true}) {
                for (boolean foldersFirst : new boolean[] {false, true}) {
                    orders.add(new ListOrder(key, descending, foldersFirst));
                }
            }
        }
        return orders;
    }

    private static void collect(JsonNode plan, List<JsonNode> nodes) {
        nodes.add(plan);
        plan.path("Plans").forEach(child -> collect(child, nodes));
    }

    /** Rows whose copied sort keys differ from their entry and current version; reservations carry none. */
    private int sortKeyDrift() {
        return database.fetchOne("select count(*) from catalog_names listed"
                        + " left join catalog_entries entry"
                        + " on entry.workspace_id = listed.workspace_id and entry.id = listed.entry_id"
                        + " left join file_versions current_version"
                        + " on current_version.entry_id = entry.id and current_version.id = entry.current_version_id"
                        + " where (listed.claim_kind = 'entry' and (listed.entry_kind is distinct from entry.kind"
                        + " or listed.entry_updated_at is distinct from entry.updated_at"
                        + " or listed.entry_size_bytes is distinct from current_version.size_bytes))"
                        + " or (listed.claim_kind <> 'entry' and (listed.entry_kind is not null"
                        + " or listed.entry_updated_at is not null or listed.entry_size_bytes is not null))")
                .get(0, Integer.class);
    }

    private static final String[] NAME_STARTS = {"a", "B", "Z", "é", "😀", "\uE000"};
    // Repeated families, so kind ties fall through to name and ID; a folder's extension never counts.
    private static final String[] NAME_ENDS = {"", ".pdf", ".JPG", ".png", ".txt", ".tar.gz", ".unknown"};
    private static final long[] SIZES = {0, 1, 1, 1024, 9007199254740993L};
    private static final long[] MICROS_AFTER = {0, 1, 1, 1_000_000};
    private int childNumber;

    /** A child whose kind, size, time and name start repeat, so ties fall through to name and ID. */
    private Entry insertChild(EntryId parent, Random random) {
        UUID id = UUID.randomUUID();
        String name = NAME_STARTS[random.nextInt(NAME_STARTS.length)] + " " + childNumber++
                + NAME_ENDS[random.nextInt(NAME_ENDS.length)];
        OffsetDateTime at = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)
                .plusNanos(MICROS_AFTER[random.nextInt(MICROS_AFTER.length)] * 1_000);
        boolean folder = random.nextInt(3) == 0;
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            UUID version = folder ? null : UUID.randomUUID();
            insertEntry(transaction, id, folder ? "folder" : "file", version, at);
            if (!folder) {
                insertVersion(transaction, id, version, SIZES[random.nextInt(SIZES.length)], at);
            }
            insertEntryName(transaction, id, parent.value(), name, at);
        });
        return catalog.get(scope, new EntryId(id));
    }

    private void insertEntry(DSLContext context, UUID id, String kind, UUID version, OffsetDateTime at) {
        context.insertInto(CATALOG_ENTRIES)
                .columns(
                        CATALOG_ENTRIES.ID,
                        CATALOG_ENTRIES.WORKSPACE_ID,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        CATALOG_ENTRIES.CURRENT_VERSION_ID)
                .values(id, WORKSPACE, kind, at, at, version)
                .execute();
    }

    private void insertVersion(DSLContext context, UUID entry, UUID version, long size, OffsetDateTime at) {
        UUID object = UUID.randomUUID();
        context.insertInto(PHYSICAL_OBJECTS)
                .columns(
                        PHYSICAL_OBJECTS.ID,
                        PHYSICAL_OBJECTS.WORKSPACE_ID,
                        PHYSICAL_OBJECTS.STORAGE_KEY,
                        PHYSICAL_OBJECTS.SIZE_BYTES,
                        PHYSICAL_OBJECTS.CREATED_AT)
                .values(object, WORKSPACE, "objects/" + object, size, at)
                .execute();
        context.insertInto(FILE_VERSIONS)
                .columns(
                        FILE_VERSIONS.ID,
                        FILE_VERSIONS.WORKSPACE_ID,
                        FILE_VERSIONS.ENTRY_ID,
                        FILE_VERSIONS.OBJECT_ID,
                        FILE_VERSIONS.ORDINAL,
                        FILE_VERSIONS.SIZE_BYTES,
                        FILE_VERSIONS.CREATED_AT)
                .values(version, WORKSPACE, entry, object, 1L, size, at)
                .execute();
    }

    private void insertEntryName(UUID entry, UUID parent, String name, OffsetDateTime now) {
        insertEntryName(database, entry, parent, name, now);
    }

    private void insertEntryName(DSLContext context, UUID entry, UUID parent, String name, OffsetDateTime now) {
        insertEntryName(context, WORKSPACE, entry, parent, name, now);
    }

    private void insertEntryName(
            DSLContext context, UUID workspace, UUID entry, UUID parent, String name, OffsetDateTime now) {
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
                .values(UUID.randomUUID(), workspace, parent, name, "entry", entry, null, now)
                .execute();
    }

    private static void assertReason(Runnable action, CatalogFailure.Reason reason) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        CatalogFailure.class,
                        exception -> assertThat(exception.reason()).isEqualTo(reason));
    }
}
