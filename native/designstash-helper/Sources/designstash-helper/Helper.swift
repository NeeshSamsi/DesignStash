import Foundation

/// The protocol version `info` reports. Bump it when a command or reply changes shape.
let protocolVersion = 1

/// One request in, one reply out, matched by `id`. Requests are answered in order, one at a time;
/// the client queues. The helper exits when stdin closes.
@main
struct DesignStashHelper {
  static func main() async {
    log("ready, protocol \(protocolVersion)")
    while let line = readLine(strippingNewline: true) {
      if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
      writeLine(await handle(line))
    }
  }

  static func handle(_ line: String) async -> [String: Any] {
    guard let data = line.data(using: .utf8),
      let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else {
      return failure(id: NSNull(), HelperError("bad_request", "a request is one JSON object per line"))
    }
    let id = request["id"] ?? NSNull()
    guard let cmd = request["cmd"] as? String else {
      return failure(id: id, HelperError("bad_request", "cmd must be a string"))
    }
    let args = Args(request["args"])
    let start = DispatchTime.now()
    do {
      var result = try await run(cmd, args)
      result["ms"] = elapsedMs(since: start)
      return ["id": id, "ok": true, "result": result]
    } catch let error as HelperError {
      return failure(id: id, error)
    } catch {
      return failure(id: id, HelperError("internal", "\(error)"))
    }
  }

  static func run(_ cmd: String, _ args: Args) async throws -> [String: Any] {
    switch cmd {
    case "info": return info()
    case "ocr": return try ocr(args)
    case "people": return try people(args)
    case "featureprint": return try featurePrint(args)
    case "classify": return try classify(args)
    case "describe": return try await describe(args)
    default: throw HelperError("unknown_command", "no command \(cmd)")
    }
  }

  static func info() -> [String: Any] {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    return [
      "protocol": protocolVersion,
      "os": "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)",
      "vision": visionInfo(),
      "foundationModels": foundationModelsInfo(),
    ]
  }

  static func failure(id: Any, _ error: HelperError) -> [String: Any] {
    ["id": id, "ok": false, "error": ["code": error.code, "message": error.message]]
  }
}
