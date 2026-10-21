// swift-tools-version: 6.0
// designstash-helper: one long-running command-line tool for Apple's on-device abilities (Vision
// and Foundation Models), spawned by the Electron main process like llama-server. Build it with
// `pnpm helper:build`; the protocol is in README.md.
import PackageDescription

let package = Package(
  name: "designstash-helper",
  platforms: [.macOS("26.0")],
  targets: [
    .executableTarget(
      name: "designstash-helper",
      path: "Sources/designstash-helper"
    )
  ]
)
