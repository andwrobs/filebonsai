// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CatalogContractChecks",
    platforms: [.macOS(.v12), .iOS(.v15)],
    dependencies: [.package(path: "../../clients/swift")],
    targets: [
        .testTarget(
            name: "CatalogContractChecks",
            dependencies: [.product(name: "FilebonsaiAPI", package: "swift")])
    ]
)
