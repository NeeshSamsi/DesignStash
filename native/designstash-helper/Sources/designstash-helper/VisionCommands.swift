import Foundation
import Vision

/// The revisions a Vision request type offers on this OS. Stored results (feature prints above all)
/// are only comparable within one revision.
func revisions(_ type: VNRequest.Type) -> [String: Any] {
  [
    "current": type.currentRevision,
    "default": type.defaultRevision,
    "supported": Array(type.supportedRevisions),
  ]
}

/// `ocr {path, level?, languageCorrection?, minConfidence?}`: printed text, one entry per line.
/// `accurate` with language correction is the default: on mockup covers `fast` misreads most text
/// (design/research/vlm-pipeline-helpers.md).
func ocr(_ args: Args) throws -> [String: Any] {
  let path = try args.string("path")
  let level = try args.optionalString("level") ?? "accurate"
  guard level == "accurate" || level == "fast" else {
    throw HelperError("bad_args", "level must be accurate or fast")
  }
  let languageCorrection = try args.bool("languageCorrection", default: true)
  let minConfidence = try args.double("minConfidence", default: 0)
  let image = try loadImage(path)

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = level == "fast" ? .fast : .accurate
  request.usesLanguageCorrection = languageCorrection
  try perform([request], on: image)

  let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first,
      Double(candidate.confidence) >= minConfidence
    else { return nil }
    return [
      "text": candidate.string,
      "confidence": num(candidate.confidence),
      "box": topLeftBox(observation.boundingBox),
    ]
  }
  return [
    "lines": lines,
    "level": level,
    "languageCorrection": languageCorrection,
    "revision": request.revision,
    "width": image.width,
    "height": image.height,
  ]
}

/// `people {path, minConfidence?}`: people (upper bodies) and hands above a confidence floor, with boxes.
/// A hand's box is the extent of its joints that clear the same floor.
func people(_ args: Args) throws -> [String: Any] {
  let path = try args.string("path")
  let minConfidence = try args.double("minConfidence", default: 0.3)
  let image = try loadImage(path)

  let bodies = VNDetectHumanRectanglesRequest()
  let hands = VNDetectHumanHandPoseRequest()
  hands.maximumHandCount = 6
  try perform([bodies, hands], on: image)

  let peopleBoxes: [[String: Any]] = (bodies.results ?? [])
    .filter { Double($0.confidence) >= minConfidence }
    .map { ["confidence": num($0.confidence), "box": topLeftBox($0.boundingBox)] }

  let handBoxes: [[String: Any]] = (hands.results ?? []).compactMap { hand in
    guard Double(hand.confidence) >= minConfidence,
      let points = try? hand.recognizedPoints(.all).values.filter({ Double($0.confidence) >= minConfidence }),
      !points.isEmpty
    else { return nil }
    let xs = points.map { $0.location.x }
    let ys = points.map { $0.location.y }
    let rect = CGRect(
      x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    return ["confidence": num(hand.confidence), "box": topLeftBox(rect)]
  }

  return [
    "peopleCount": peopleBoxes.count,
    "handCount": handBoxes.count,
    "people": peopleBoxes,
    "hands": handBoxes,
    "minConfidence": num(minConfidence),
  ]
}

/// `featureprint {path}`: the image's feature print as base64 little-endian Float32, with its revision.
func featurePrint(_ args: Args) throws -> [String: Any] {
  let path = try args.string("path")
  let image = try loadImage(path)
  let request = VNGenerateImageFeaturePrintRequest()
  try perform([request], on: image)
  guard let observation = request.results?.first else {
    throw HelperError("vision_failed", "Vision returned no feature print")
  }

  var floats: [Float32]
  switch observation.elementType {
  case .float:
    floats = observation.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
  case .double:
    floats = observation.data.withUnsafeBytes { $0.bindMemory(to: Double.self).map { Float32($0) } }
  default:
    throw HelperError("vision_failed", "unexpected feature print element type")
  }
  floats = floats.map { $0.isFinite ? $0 : 0 }
  let data = floats.withUnsafeBufferPointer { Data(buffer: $0) }
  return [
    "revision": request.revision,
    "elementCount": floats.count,
    "data": data.base64EncodedString(),
  ]
}

/// `classify {path, max?, minConfidence?}`: the best labels from Vision's fixed taxonomy.
func classify(_ args: Args) throws -> [String: Any] {
  let path = try args.string("path")
  let max = try args.int("max", default: 10) ?? 10
  let minConfidence = try args.double("minConfidence", default: 0.05)
  guard max > 0 else { throw HelperError("bad_args", "max must be 1 or more") }
  let image = try loadImage(path)
  let request = VNClassifyImageRequest()
  try perform([request], on: image)
  let labels: [[String: Any]] = (request.results ?? [])
    .filter { Double($0.confidence) >= minConfidence }
    .sorted { $0.confidence > $1.confidence }
    .prefix(max)
    .map { ["label": $0.identifier, "confidence": num($0.confidence)] }
  return ["labels": labels, "revision": request.revision]
}

/// What `info` reports about Vision.
func visionInfo() -> [String: Any] {
  [
    "ocr": revisions(VNRecognizeTextRequest.self),
    "classify": revisions(VNClassifyImageRequest.self),
    "featurePrint": revisions(VNGenerateImageFeaturePrintRequest.self),
    "humanRectangles": revisions(VNDetectHumanRectanglesRequest.self),
    "handPose": revisions(VNDetectHumanHandPoseRequest.self),
  ]
}
