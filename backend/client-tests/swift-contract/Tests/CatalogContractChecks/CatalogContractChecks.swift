import FilebonsaiAPI
import Foundation
import XCTest

final class CatalogContractChecks: XCTestCase {
    func testDecodesFilePrecisionAndRootNullability() throws {
        let file = try decoder.decode(FileEntryResponse.self, from: fixture("file"))
        let root = try decoder.decode(FolderEntryResponse.self, from: fixture("root"))

        XCTAssertEqual(file.kind, .file)
        XCTAssertEqual(file.currentVersion.sizeBytes, "9007199254740993")
        XCTAssertEqual(root.kind, .folder)
        XCTAssertNil(root.parentId)
    }

    func testDecodesDiscriminatedAndEmptyPages() throws {
        let page = try decoder.decode(EntryPageResponse.self, from: fixture("page"))
        let emptyPage = try decoder.decode(EntryPageResponse.self, from: fixture("empty-page"))

        XCTAssertEqual(page.entries.count, 1)
        guard case .typeFileEntryResponse = page.entries[0] else {
            return XCTFail("Expected the first fixture page entry to be a file")
        }
        XCTAssertTrue(emptyPage.entries.isEmpty)
        XCTAssertNil(emptyPage.nextCursor)
    }

    func testDecodesFractionalTimestamp() throws {
        let json = Data(
            """
            {
              "createdAt": "2026-02-01T00:00:00.123456Z",
              "id": "00000000-0000-4000-8000-000000000003",
              "kind": "folder",
              "name": "Recipes",
              "parentId": null,
              "updatedAt": "2026-02-01T00:00:00.123456Z"
            }
            """.utf8)

        XCTAssertNoThrow(try decoder.decode(FolderEntryResponse.self, from: json))
    }

    func testPreservesFutureErrorCodeAndIgnoresAdditiveFields() throws {
        let error = try decoder.decode(ApiErrorResponse.self, from: fixture("future-error"))

        XCTAssertEqual(error.code, "FUTURE_SERVER_ERROR")
    }

    func testRejectsUnknownEntryDiscriminator() {
        let json = Data("{\"kind\":\"future\",\"id\":\"opaque\"}".utf8)

        XCTAssertThrowsError(try decoder.decode(EntryResponse.self, from: json))
    }

    func testDecodesAuthenticatedSessionExpiry() throws {
        let json = Data(
            """
            {
              "principalId": "20000000-0000-4000-8000-000000000001",
              "expiresAt": "2026-09-20T18:00:00.123456Z"
            }
            """.utf8)

        let session = try decoder.decode(AccessSessionResponse.self, from: json)
        XCTAssertEqual(session.principalId.uuidString.lowercased(), "20000000-0000-4000-8000-000000000001")
    }

    func testDecodesDurableUploadStateWithExactDecimalByteCounts() throws {
        let json = Data(
            """
            {
              "id": "50000000-0000-4000-8000-000000000001",
              "entryId": "00000000-0000-4000-8000-000000000010",
              "versionId": "30000000-0000-4000-8000-000000000010",
              "parentId": "00000000-0000-4000-8000-000000000001",
              "name": "upload.bin",
              "sizeBytes": "9007199254740993",
              "expectedSha256": null,
              "computedSha256": null,
              "state": "INITIATED",
              "expiresAt": "2026-09-21T18:00:00.123456Z"
            }
            """.utf8)

        let upload = try decoder.decode(UploadResponse.self, from: json)
        XCTAssertEqual(upload.sizeBytes, "9007199254740993")
        XCTAssertNil(upload.expectedSha256)
        XCTAssertNil(upload.computedSha256)
    }

    func testDecodesUploadLimitsAsAnExactDecimalByteCount() throws {
        let json = Data("{\"maximumBytes\":\"9007199254740993\",\"futureLimit\":\"1\"}".utf8)

        let limits = try decoder.decode(UploadLimitsResponse.self, from: json)
        XCTAssertEqual(limits.maximumBytes, "9007199254740993")
    }

    private var decoder: JSONDecoder {
        CodableHelper.jsonDecoder
    }

    private func fixture(_ name: String) throws -> Data {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 {
            root.deleteLastPathComponent()
        }
        return try Data(contentsOf: root.appendingPathComponent("contract/fixtures/\(name).json"))
    }
}
