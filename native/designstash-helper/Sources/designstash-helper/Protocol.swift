import Foundation

/// A failed command: becomes `{id, ok: false, error: {code, message}}`. Codes are listed in README.md.
struct HelperError: Error {
  let code: String
  let message: String

  init(_ code: String, _ message: String) {
    self.code = code
    self.message = message
  }
}

/// What a command gets: the request's `args` object, read with typed accessors that fail as `bad_args`.
struct Args {
  let values: [String: Any]

  init(_ raw: Any?) {
    values = raw as? [String: Any] ?? [:]
  }

  func has(_ key: String) -> Bool {
    guard let value = values[key] else { return false }
    return !(value is NSNull)
  }

  func string(_ key: String) throws -> String {
    guard let value = values[key] as? String else {
      throw HelperError("bad_args", "\(key) must be a string")
    }
    return value
  }

  /// A string, or nil when the key is missing or null.
  func optionalString(_ key: String) throws -> String? {
    guard has(key) else { return nil }
    return try string(key)
  }

  func bool(_ key: String, default fallback: Bool) throws -> Bool {
    guard has(key) else { return fallback }
    guard let value = values[key] as? Bool else { throw HelperError("bad_args", "\(key) must be true or false") }
    return value
  }

  func double(_ key: String, default fallback: Double) throws -> Double {
    guard has(key) else { return fallback }
    guard let value = values[key] as? NSNumber, !(values[key] is Bool) else {
      throw HelperError("bad_args", "\(key) must be a number")
    }
    return value.doubleValue
  }

  func int(_ key: String, default fallback: Int?) throws -> Int? {
    guard has(key) else { return fallback }
    guard let value = values[key] as? NSNumber, !(values[key] is Bool), value.doubleValue == value.doubleValue.rounded()
    else {
      throw HelperError("bad_args", "\(key) must be a whole number")
    }
    return value.intValue
  }

  func object(_ key: String) throws -> [String: Any]? {
    guard has(key) else { return nil }
    guard let value = values[key] as? [String: Any] else { throw HelperError("bad_args", "\(key) must be an object") }
    return value
  }
}

/// A finite number for JSON: JSONSerialization raises on NaN and infinity, which would crash the helper.
func num(_ value: Double) -> Double {
  value.isFinite ? value : 0
}

func num(_ value: Float) -> Double {
  num(Double(value))
}

/// Whole milliseconds since `start`.
func elapsedMs(since start: DispatchTime) -> Int {
  Int((Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1e6).rounded())
}

/// Writes one JSON object as one line on stdout. Anything that can't be encoded is reported as an internal error instead.
func writeLine(_ object: [String: Any]) {
  var data: Data
  if JSONSerialization.isValidJSONObject(object),
    let encoded = try? JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes])
  {
    data = encoded
  } else {
    let fallback: [String: Any] = [
      "id": object["id"] ?? NSNull(), "ok": false,
      "error": ["code": "internal", "message": "the reply could not be encoded as JSON"],
    ]
    data = (try? JSONSerialization.data(withJSONObject: fallback)) ?? Data("{\"ok\":false}".utf8)
  }
  data.append(0x0A)
  FileHandle.standardOutput.write(data)
}

/// Logs go to stderr only; stdout carries nothing but replies.
func log(_ message: String) {
  FileHandle.standardError.write(Data("[designstash-helper] \(message)\n".utf8))
}
