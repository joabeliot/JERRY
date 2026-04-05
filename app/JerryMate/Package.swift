// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JerryMate",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "JerryMate",
            path: "Sources"
        )
    ]
)
