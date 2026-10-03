-- The kind sort orders by a family guessed from the name's extension: folders, known
-- families by label, then unknown files. KindFamily in Java owns the same table; a
-- PostgreSQL test checks that both agree for every extension. Changing the table needs a
-- new migration that replaces this function and rebuilds the column and index.

CREATE FUNCTION catalog_kind_rank(entry_kind varchar, name text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN entry_kind IS NULL THEN NULL
        WHEN entry_kind = 'folder' THEN 0
        ELSE CASE translate(
                coalesce(substring(name FROM '^.+\.([^.]*)$'), ''),
                'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                'abcdefghijklmnopqrstuvwxyz')
            WHEN 'zip' THEN 1 WHEN 'tar' THEN 1 WHEN 'gz' THEN 1 WHEN 'tgz' THEN 1 WHEN 'bz2' THEN 1
            WHEN 'xz' THEN 1 WHEN '7z' THEN 1 WHEN 'rar' THEN 1 WHEN 'zst' THEN 1
            WHEN 'mp3' THEN 2 WHEN 'm4a' THEN 2 WHEN 'aac' THEN 2 WHEN 'wav' THEN 2 WHEN 'flac' THEN 2
            WHEN 'ogg' THEN 2 WHEN 'opus' THEN 2 WHEN 'aiff' THEN 2
            WHEN 'js' THEN 3 WHEN 'ts' THEN 3 WHEN 'tsx' THEN 3 WHEN 'jsx' THEN 3 WHEN 'json' THEN 3
            WHEN 'java' THEN 3 WHEN 'py' THEN 3 WHEN 'rb' THEN 3 WHEN 'go' THEN 3 WHEN 'rs' THEN 3
            WHEN 'swift' THEN 3 WHEN 'kt' THEN 3 WHEN 'c' THEN 3 WHEN 'h' THEN 3 WHEN 'cpp' THEN 3
            WHEN 'sh' THEN 3 WHEN 'yml' THEN 3 WHEN 'yaml' THEN 3 WHEN 'toml' THEN 3 WHEN 'xml' THEN 3
            WHEN 'html' THEN 3 WHEN 'css' THEN 3 WHEN 'sql' THEN 3
            WHEN 'doc' THEN 4 WHEN 'docx' THEN 4 WHEN 'odt' THEN 4 WHEN 'rtf' THEN 4 WHEN 'pages' THEN 4
            WHEN 'jpg' THEN 5 WHEN 'jpeg' THEN 5 WHEN 'png' THEN 5 WHEN 'gif' THEN 5 WHEN 'webp' THEN 5
            WHEN 'heic' THEN 5 WHEN 'heif' THEN 5 WHEN 'avif' THEN 5 WHEN 'bmp' THEN 5 WHEN 'tif' THEN 5
            WHEN 'tiff' THEN 5 WHEN 'svg' THEN 5 WHEN 'raw' THEN 5 WHEN 'dng' THEN 5 WHEN 'cr2' THEN 5
            WHEN 'nef' THEN 5 WHEN 'arw' THEN 5
            WHEN 'pdf' THEN 6
            WHEN 'ppt' THEN 7 WHEN 'pptx' THEN 7 WHEN 'odp' THEN 7 WHEN 'key' THEN 7
            WHEN 'xls' THEN 8 WHEN 'xlsx' THEN 8 WHEN 'ods' THEN 8 WHEN 'csv' THEN 8 WHEN 'tsv' THEN 8
            WHEN 'numbers' THEN 8
            WHEN 'txt' THEN 9 WHEN 'md' THEN 9 WHEN 'markdown' THEN 9 WHEN 'log' THEN 9
            WHEN 'mp4' THEN 10 WHEN 'm4v' THEN 10 WHEN 'mov' THEN 10 WHEN 'mkv' THEN 10 WHEN 'webm' THEN 10
            WHEN 'avi' THEN 10
            ELSE 11
        END
    END
$$;

-- Generated after V9's BEFORE trigger sets entry_kind, and on every rename. Adding it
-- computes the rank for existing rows, so no backfill is needed.
ALTER TABLE catalog_names
    ADD COLUMN entry_kind_rank smallint GENERATED ALWAYS AS (catalog_kind_rank(entry_kind, name)) STORED;

CREATE INDEX ix_catalog_names_page_kind
    ON catalog_names (workspace_id, parent_id, entry_kind_rank, name COLLATE "C", entry_id)
    WHERE claim_kind = 'entry';
