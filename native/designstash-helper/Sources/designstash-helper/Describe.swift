import Foundation
import FoundationModels

/// Whether Apple's on-device model can take an image prompt here, and if not, why. Image prompts
/// need macOS 27; the model also needs an eligible Mac with Apple Intelligence on and its assets downloaded.
func foundationModelsInfo() -> [String: Any] {
  guard #available(macOS 27, *) else {
    return ["available": false, "reason": "notMacOS27"]
  }
  switch SystemLanguageModel.default.availability {
  case .available:
    return ["available": true]
  case .unavailable(let reason):
    return ["available": false, "reason": unavailableReason(reason)]
  }
}

@available(macOS 27, *)
func unavailableReason(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
  switch reason {
  case .deviceNotEligible: return "deviceNotEligible"
  case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
  case .modelNotReady: return "modelNotReady"
  @unknown default: return "unknown"
  }
}

/// `describe {path | null, instructions, prompt, schema?, maxTokens?}`: one answer from Apple's
/// on-device model, greedy so the same input gives the same answer. With `schema` the reply is
/// generated to that shape and returned as JSON text; without, it is plain text.
func describe(_ args: Args) async throws -> [String: Any] {
  let path = try args.optionalString("path")
  let instructions = try args.string("instructions")
  let prompt = try args.string("prompt")
  let schema = try args.object("schema")
  let maxTokens = try args.int("maxTokens", default: nil)

  guard #available(macOS 27, *) else {
    throw HelperError("unavailable", "Foundation Models with images needs macOS 27 (notMacOS27)")
  }
  // Checked before the model so a bad request is a bad request on any Mac.
  let generationSchema = try schema.map { try GenerationSchema(root: convertSchema($0, name: "Reply"), dependencies: []) }
  let image = try path.map(loadImage)
  if case .unavailable(let reason) = SystemLanguageModel.default.availability {
    throw HelperError("unavailable", "Foundation Models unavailable (\(unavailableReason(reason)))")
  }

  let session = LanguageModelSession(instructions: instructions)
  let options = GenerationOptions(samplingMode: .greedy, maximumResponseTokens: maxTokens)
  do {
    if let generationSchema {
      let response = try await session.respond(schema: generationSchema, options: options) {
        if let image { Attachment(image.image, orientation: image.orientation) }
        prompt
      }
      return ["text": response.content.jsonString, "json": true]
    }
    let response = try await session.respond(options: options) {
      if let image { Attachment(image.image, orientation: image.orientation) }
      prompt
    }
    return ["text": response.content, "json": false]
  } catch let error as LanguageModelSession.GenerationError {
    if case .unsupportedGuide = error {
      // Seen on macOS 27.2 for any `pattern`, even `[A-Za-z ]+`; enums and array counts work.
      throw HelperError("bad_schema", "the model can't follow a guide in this schema (regex patterns are not supported): \(error)")
    }
    throw HelperError(generationErrorCode(error), "\(error)")
  } catch {
    throw HelperError("generation_failed", "\(error)")
  }
}

@available(macOS 27, *)
func generationErrorCode(_ error: LanguageModelSession.GenerationError) -> String {
  switch error {
  case .guardrailViolation, .refusal: return "refused"
  case .exceededContextWindowSize: return "context_too_long"
  case .assetsUnavailable: return "unavailable"
  case .unsupportedGuide: return "bad_schema"
  case .rateLimited, .concurrentRequests: return "busy"
  default: return "generation_failed"
  }
}

/// A JSON-schema-like object as a guided-generation schema, built at run time so no `@Generable`
/// macro (and so no Xcode) is needed. Supported: `object` (`properties`, `required`), `array`
/// (`items`, `minItems`, `maxItems`), `string` (`enum`, `pattern`), `integer` and `number`
/// (`minimum`, `maximum`), `boolean`, and `description` anywhere. Object properties are generated in
/// the order of `required`, then the rest by name, since JSON objects carry no order. A pattern's
/// leading `^` and trailing `$` are dropped: a guide always matches the whole value. On macOS 27.2
/// the on-device model rejects every pattern at generation time (`bad_schema`), so callers leave
/// them out; they're passed on in case a later model takes them. Anything else is `bad_schema`.
func convertSchema(_ node: [String: Any], name: String) throws -> DynamicGenerationSchema {
  let description = node["description"] as? String
  if let choices = node["enum"] {
    guard let strings = choices as? [String], !strings.isEmpty else {
      throw HelperError("bad_schema", "\(name): enum must be a list of strings")
    }
    return DynamicGenerationSchema(name: name, description: description, anyOf: strings)
  }
  guard let type = node["type"] as? String else {
    throw HelperError("bad_schema", "\(name): type is missing")
  }
  switch type {
  case "object":
    let properties = node["properties"] as? [String: Any] ?? [:]
    let required = node["required"] as? [String] ?? []
    let order = required.filter { properties[$0] != nil } + properties.keys.filter { !required.contains($0) }.sorted()
    let converted: [DynamicGenerationSchema.Property] = try order.map { key in
      guard let child = properties[key] as? [String: Any] else {
        throw HelperError("bad_schema", "\(name).\(key): must be an object")
      }
      return DynamicGenerationSchema.Property(
        name: key,
        description: child["description"] as? String,
        schema: try convertSchema(child, name: "\(name).\(key)"),
        isOptional: !required.contains(key)
      )
    }
    return DynamicGenerationSchema(name: name, description: description, properties: converted)
  case "array":
    guard let items = node["items"] as? [String: Any] else {
      throw HelperError("bad_schema", "\(name): an array needs items")
    }
    return DynamicGenerationSchema(
      arrayOf: try convertSchema(items, name: "\(name).item"),
      minimumElements: node["minItems"] as? Int,
      maximumElements: node["maxItems"] as? Int
    )
  case "string":
    var guides: [GenerationGuide<String>] = []
    if let pattern = node["pattern"] as? String {
      var body = Substring(pattern)
      if body.hasPrefix("^") { body = body.dropFirst() }
      if body.hasSuffix("$") && !body.hasSuffix("\\$") { body = body.dropLast() }
      do {
        guides.append(.pattern(try Regex(String(body))))
      } catch {
        throw HelperError("bad_schema", "\(name): pattern is not a regular expression: \(error)")
      }
    }
    return DynamicGenerationSchema(type: String.self, guides: guides)
  case "integer":
    var guides: [GenerationGuide<Int>] = []
    if let minimum = node["minimum"] as? Int { guides.append(.minimum(minimum)) }
    if let maximum = node["maximum"] as? Int { guides.append(.maximum(maximum)) }
    return DynamicGenerationSchema(type: Int.self, guides: guides)
  case "number":
    var guides: [GenerationGuide<Double>] = []
    if let minimum = node["minimum"] as? Double { guides.append(.minimum(minimum)) }
    if let maximum = node["maximum"] as? Double { guides.append(.maximum(maximum)) }
    return DynamicGenerationSchema(type: Double.self, guides: guides)
  case "boolean":
    return DynamicGenerationSchema(type: Bool.self)
  default:
    throw HelperError("bad_schema", "\(name): type \(type) is not supported")
  }
}
