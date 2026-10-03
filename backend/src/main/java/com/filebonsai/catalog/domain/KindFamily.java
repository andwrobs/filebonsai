package com.filebonsai.catalog.domain;

import java.util.Set;

/**
 * A display family guessed from a file name's extension. The name is metadata, never content, so the family is a hint.
 * Ranks order the kind sort: folders, known families by label, then unknown files. Flyway V10's
 * {@code catalog_kind_rank} must map every extension to the same rank.
 */
public enum KindFamily {
    FOLDER(0, Set.of()),
    ARCHIVE(1, Set.of("zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst")),
    AUDIO(2, Set.of("mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "aiff")),
    CODE(
            3,
            Set.of(
                    "js", "ts", "tsx", "jsx", "json", "java", "py", "rb", "go", "rs", "swift", "kt", "c", "h", "cpp",
                    "sh", "yml", "yaml", "toml", "xml", "html", "css", "sql")),
    DOCUMENT(4, Set.of("doc", "docx", "odt", "rtf", "pages")),
    IMAGE(
            5,
            Set.of(
                    "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg", "raw",
                    "dng", "cr2", "nef", "arw")),
    PDF(6, Set.of("pdf")),
    PRESENTATION(7, Set.of("ppt", "pptx", "odp", "key")),
    SPREADSHEET(8, Set.of("xls", "xlsx", "ods", "csv", "tsv", "numbers")),
    TEXT(9, Set.of("txt", "md", "markdown", "log")),
    VIDEO(10, Set.of("mp4", "m4v", "mov", "mkv", "webm", "avi")),
    FILE(11, Set.of());

    private final int rank;
    private final Set<String> extensions;

    KindFamily(int rank, Set<String> extensions) {
        this.rank = rank;
        this.extensions = extensions;
    }

    public int rank() {
        return rank;
    }

    public Set<String> extensions() {
        return extensions;
    }

    public static KindFamily of(Entry entry) {
        return entry instanceof Entry.Folder ? FOLDER : ofFile(entry.name());
    }

    /** The text after the last dot, unless the dot leads the name, compared in ASCII lower case. */
    public static KindFamily ofFile(FileName name) {
        String value = name.value();
        int dot = value.lastIndexOf('.');
        String extension = dot > 0 ? asciiLowerCase(value.substring(dot + 1)) : "";
        for (KindFamily family : values()) {
            if (family.extensions.contains(extension)) {
                return family;
            }
        }
        return FILE;
    }

    // Locale-free and ASCII-only, so it matches PostgreSQL's translate() whatever the database collation.
    private static String asciiLowerCase(String value) {
        var result = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            result.append(character >= 'A' && character <= 'Z' ? (char) (character + ('a' - 'A')) : character);
        }
        return result.toString();
    }
}
