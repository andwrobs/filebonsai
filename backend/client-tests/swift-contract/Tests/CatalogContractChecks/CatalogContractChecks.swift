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
