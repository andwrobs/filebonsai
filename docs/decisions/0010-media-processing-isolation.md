# 0010: Isolate media processing by risk and keep photo location private

Status: accepted
Accepted: 2026-09-28
Date: 2026-09-27

## Context

Photo metadata (PRV-04) and thumbnails (PRV-02) are the first features that read file
content after upload. Processing starts only from a committed immutable version
through a durable job (decision [0009](0009-durable-jobs-in-postgresql.md)) and must
be bounded (INV-15).

Image tooling has failed in ways that go beyond crashes. The loader is chosen from the
file's content, not its name. The damage often comes from loader features such as
external references, delegate programs and evaluated content, not only memory bugs:

- CVE-2026-66066 (July 2026): Rails apps using libvips accepted a crafted MAT/HDF5 file
  presented as an image. An unfuzzed loader followed external dataset references and
  exposed server secrets. The fix blocks libvips operations marked untrusted.
- CVE-2021-22204: ExifTool's DjVu parser evaluated file content as Perl. It was
  exploited through image uploads to GitLab.
- CVE-2016-3714 (ImageTragick): ImageMagick delegates ran shell commands named inside
  image files.

## Threat model

**Assets:** server secrets (database and R2 credentials, session and cursor keys, owner
secret files), other workspaces' files, backend availability, and the location and
identity data inside photos.

**Entry:** any file that reaches a library. Today that means uploads; later it
includes server-folder import and drop folders (IMP-01, IMP-05). Every file is
hostile, including the owner's own uploads, which arrive from email, messaging and
downloads.

| Threat | Response |
| --- | --- |
| Memory corruption in a native decoder leads to code execution | Native decoders run only in the sandbox container, which has no network, secrets or storage mounts and sees only the job's input |
| A loader reads files, runs commands or follows references | Formats come from an allow-list matched on magic bytes. Each maps to one named loader. libvips blocks untrusted operations. No ImageMagick, ExifTool, Ghostscript or other delegate programs |
| Pixel or decompression bombs | Header dimensions are checked before decode, with pixel and side caps, shrink-on-load and a memory limit |
| A parser exhausts CPU or memory | The OS enforces wall-clock, CPU, memory, input, disk and output budgets on a killable process. A breach ends that job with a recorded outcome, never the backend |
| Hostile processor output | The backend treats output as untrusted. It caps size, validates the schema, sanitizes strings and checks ranges. It writes derived bytes only under keys it chooses and serves only formats it produced |
| Location and identity leak | GPS is stored apart from other metadata. It is returned only on a member's detail read and never included in listings, shares or exports without opt-in. Serial numbers and owner names are never extracted. Thumbnails carry no metadata |
| One workspace reads another's derived data | Jobs carry their workspace, derived rows are keyed by version, and every read is workspace-scoped. Others get `404` (INV-01, INV-12) |
| Processing starves the library | Each job kind has a concurrency cap (0009). Upload and download never wait on processing. Processing failure never changes `AVAILABLE` |

Out of scope: container or kernel escape, a malicious operator, and valid images whose
pictures are misleading.

## Decision

### Two isolation tiers

Parser choice and resource budgets follow memory safety and capabilities. Both
tiers require the same per-job container security boundary. A parser compromise
must not gain access to backend mounts, credentials, another job, or another workspace.

**Tier A: memory-safe metadata parsing.** metadata-extractor 2.19 (Apache-2.0) is pure
Java. It reads metadata without decoding pixels and follows no external references.
It runs in a child JVM inside a separate per-job sandbox container, never in the
backend container. One job handles one immutable version. The child has:

- an empty environment, no credentials, no network, and no backend or storage mounts;
- capped heap, metaspace and thread stacks, one processor, and exit on out-of-memory;
- input streamed on stdin within a byte budget;
- a single JSON document on stdout within an output cap;
- a wall-clock deadline, after which the backend kills its process tree.

The sandbox also has the read-only root, resource limits, restricted user and private
job mounts described below. Clearing an environment or choosing a memory-safe parser
does not constrain filesystem access after code execution. Tier A therefore depends
on PRV-10, just as Tier B does. Without the sandbox, extraction is unavailable and
original availability is unaffected.

**Tier B: native decode and encode (libvips).** Tier B runs in a separate processor
container per job, using an image built with each release. The container has:

- no network (`network_mode: none`);
- a read-only root and size-capped tmpfs scratch;
- memory, CPU and PID limits, no capabilities and `no-new-privileges`;
- a non-root user, and no secrets or storage mounts.

The backend stages a private directory for each job. Only that job's read-only input
and bounded output directory are mounted into its sandbox; the shared spool root,
other jobs, backend data, credential files and container-control sockets are never
mounted. A separate process inside a shared spool mount is not sufficient isolation.
The trusted launcher must enforce these restrictions rather than accept arbitrary
paths, mounts or commands from a processor.

Each job has a deadline on both sides. Before consuming output, the backend stops
and reaps the sandbox and its children, then opens only the expected regular files
without following links. Symlinks, hard links, special files, path traversal,
unexpected files and oversized output are rejected; validation and consumption use
the same pinned file descriptors. The backend chooses the final storage keys and
removes job directories after consumption or failure. libvips runs with untrusted
operations blocked and only the allow-listed loaders enabled. Without the container,
Tier B is disabled: previews report that they are unavailable, and originals are
unaffected.

Two alternatives are rejected. ImageIO with TwelveMonkeys in the backend JVM would
decode whole rasters into the server heap: a 100-megapixel ARGB image needs about
400 MB. A decode could not be stopped without stopping the server, and it has no WebP
encoder. ExifTool would add a Perl runtime with a history of content-driven code
execution.

### Formats

The file's magic bytes choose the parser. The filename extension never does, because
filenames are user metadata.

- **Metadata, first set:** JPEG, HEIC/HEIF, AVIF, PNG, WebP, TIFF and DNG. HEIC is the
  iPhone's default format, and metadata-extractor reads its boxes without decoding
  HEVC. Video metadata waits for PRV-06.
- **Thumbnails, first set:** JPEG, PNG, WebP and GIF (first frame), plus AVIF if the
  pinned libvips marks its loader trusted. HEIC thumbnails need an HEVC decoder, which
  raises its own patent and packaging questions, so they wait for a separate decision.
  TIFF, camera raw, PSD, SVG, PDF and everything else are refused until an item adds
  them with its own evidence.

### Starting limits

These defaults are configurable. PRV-02 and PRV-04 measure them and record baselines.

- **Tier A:** 64 MiB heap, 10 seconds per version, input up to the upload limit, and
  1 MiB of output.
- **Tier B:** 512 MiB of memory, 30 seconds per job, 200 megapixels and 32,768 px per
  side (checked from the header before decode), first frame only, and 2 MiB per
  rendition.

### Photo metadata

Extraction keeps an allow-listed, normalized set, never a raw tag dump.

- **Image:** format; stored pixel width and height, taken from the codec header rather
  than EXIF `PixelXDimension`, which editors leave stale; and orientation 1–8. The API
  reports display dimensions with the orientation applied.
- **Taken:** `DateTimeOriginal` with sub-seconds, plus its UTC offset when
  `OffsetTimeOriginal` or an equivalent is present. Without an offset it remains a local
  date and time; Filebonsai never invents a time zone. Sorting by taken time uses the
  local wall-clock value.
- **Camera:** make, model, lens and software.
- **Exposure:** exposure time kept as a fraction (1/250 s), f-number, ISO, focal length,
  35 mm equivalent, exposure bias, whether the flash fired, metering mode and exposure
  program.
- **Authorship:** artist, copyright and description.
- **Location, in a separate private table:** latitude and longitude in WGS84 decimal
  degrees, plus altitude in metres. An exact (0, 0) counts as absent, because many
  cameras write it without a fix.
- **Never extracted:** body and lens serial numbers, owner names, maker notes, embedded
  thumbnails, XMP edit history and face regions.

Strings are NFC-normalized, stripped of control characters, trimmed and capped at 256
characters. Empty strings become absent. A number outside its plausible range becomes
absent for that field alone, so a malformed field never fails a version. Each version
records one outcome: extracted, no metadata, unsupported format, or failed with a
reason code such as malformed or over budget. All four are successful jobs. Only
infrastructure failures retry (0009).

### Derived assets

- **Renditions:** WebP bounded to 256 and 1024 px on the long edge, never upscaled,
  converted to sRGB, rotated for EXIF orientation, and stripped of all metadata.
- **Storage:** a local derived store under the server's data root. It is keyed by
  workspace, version, rendition and renderer version, never by filename. Derived assets
  can be regenerated, so they are left out of export and backup and deleted with their
  version (ORG-05). They are not written to the originals' storage connection, so
  browsing never costs provider requests.
- **Serving:** authenticated and workspace-scoped like the original download, and other
  workspaces get `404`. Responses are `image/webp` with `nosniff`, served inline only
  because the server produced the bytes. They are private and cacheable per version and
  renderer version. A browser can keep cached thumbnails after sign-out, a known
  limitation on shared devices.
- **Originals:** always served as unchanged attachments, so a downloaded original still
  carries its own GPS. ACC-03 decides whether shared originals are stripped.

### Versioning and regeneration

Each metadata row and derived asset records a Filebonsai-owned extractor or renderer
version. The version is bumped when a library upgrade or a normalization change alters
output. A periodic sweeper enqueues versions that have no result or an older one. That
covers backfilling files uploaded before processing existed, version bumps, and a lost
derived store. Publication also enqueues work in its own transaction, so new uploads
do not wait for the sweeper. Tool versions are logged but are not keys.

## Consequences

- `storage-and-transfers.md` describes processing through this record with no
  in-backend parsing or network-isolation exception.
- PRV-10 builds the shared per-job sandbox boundary for both tiers. PRV-04 metadata,
  PRV-02 thumbnails and PRV-05's PDF thumbnails depend on it.
- New configuration covers processing enablement, budgets and the spool path.
- Evidence obligations for Tier A:
  - malformed and truncated fixtures for every format, looping IFDs and oversized
    declared lengths;
  - a time-budget breach kills the child and records the outcome;
  - the heap and output caps hold;
  - uploads and downloads continue meanwhile;
  - the child's environment is empty; backend data, credentials, control sockets and
    another concurrently running job's files are inaccessible; network connections fail.
- Evidence obligations for Tier B:
  - from inside the sandbox, network connections fail, and backend secret files and
    storage are unreadable;
  - a MAT, SVG or PDF body named `.jpg` is refused;
  - a decode bomb and a hung job stop within budget;
  - two concurrent jobs cannot read inputs or alter outputs belonging to each other;
  - hostile processor output, including links and non-regular files, is rejected
    after sandbox termination and before storage publication.
- Privacy and authorization evidence: GPS is absent from listings, and from shares and
  exports once they exist, and serial numbers are never stored. Metadata and previews
  return `404` to other workspaces.

## References

- [metadata-extractor: formats, license, no pixel decoding](https://github.com/drewnoakes/metadata-extractor) (read 2026-09-27)
- [libvips 8.13: blocking untrusted operations](https://www.libvips.org/2022/05/28/What's-new-in-8.13.html)
- [CVE-2026-66066 coverage](https://thehackernews.com/2026/07/critical-rails-flaw-could-let.html) (read 2026-09-27)
- [NVD: CVE-2021-22204](https://nvd.nist.gov/vuln/detail/CVE-2021-22204)
