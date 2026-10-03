package com.filebonsai.catalog.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class KindFamilyTest {
    @Test
    void readsTheLastExtensionInAsciiLowerCase() {
        assertThat(family("Italy.pdf")).isEqualTo(KindFamily.PDF);
        assertThat(family("IMG_0001.HEIC")).isEqualTo(KindFamily.IMAGE);
        assertThat(family("backup.tar.gz")).isEqualTo(KindFamily.ARCHIVE);
        assertThat(family("report.pdf.zip")).isEqualTo(KindFamily.ARCHIVE);
        assertThat(family("..txt")).isEqualTo(KindFamily.TEXT);
    }

    @Test
    void unknownLeadingDotAndNonAsciiExtensionsAreFiles() {
        assertThat(family("README")).isEqualTo(KindFamily.FILE);
        assertThat(family("trailing.")).isEqualTo(KindFamily.FILE);
        assertThat(family(".md")).isEqualTo(KindFamily.FILE);
        assertThat(family("model.blend")).isEqualTo(KindFamily.FILE);
        // Only ASCII letters fold, as PostgreSQL's translate() does whatever the database collation.
        assertThat(family("notes.T\u00ccXT")).isEqualTo(KindFamily.FILE);
    }

    @Test
    void ranksAreDistinctAndExtensionsBelongToOneFamily() {
        var ranks = new HashSet<Integer>();
        var extensions = new HashSet<String>();
        for (KindFamily family : KindFamily.values()) {
            assertThat(ranks.add(family.rank())).as("%s rank", family).isTrue();
            for (String extension : family.extensions()) {
                assertThat(extensions.add(extension)).as(extension).isTrue();
            }
        }
        assertThat(KindFamily.FOLDER.rank()).isZero();
        assertThat(ranks).allMatch(rank -> rank <= KindFamily.FILE.rank());
        assertThat(Set.of(KindFamily.values())).hasSize(12);
    }

    private static KindFamily family(String name) {
        return KindFamily.ofFile(new FileName(name));
    }
}
