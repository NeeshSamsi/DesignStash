// ai-eval Vision pass: for each cover under <coversDir>/<id>/, run Apple's Vision framework once
// and write <coversDir>/<id>/vision.json, which prompt versions read as `ctx.vision`.
// Dev tooling for the eval harness only; nothing here ships in the app.
//
//   swiftc -O -o tmp/ai-eval-vision scripts/ai-eval/apple/vision.swift
//   tmp/ai-eval-vision "$HOME/Library/Application Support/DesignStash-dev/ai-eval/covers"
//
// Text uses `accurate` with language correction on the 2048 px cover.webp: on these covers `fast`
// misreads most text and the 1024 px preview loses small print (design/research/vlm-pipeline-helpers.md).
import Foundation
import ImageIO
import Vision

func load(_ url: URL) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func ms(_ t0: DispatchTime) -> Double {
  Double(DispatchTime.now().uptimeNanoseconds - t0.uptimeNanoseconds) / 1e6
}

let coversDir = URL(fileURLWithPath: CommandLine.arguments[1])
let ids = try FileManager.default.contentsOfDirectory(atPath: coversDir.path)
  .filter { !$0.hasPrefix(".") }
  .sorted()

var written = 0
for id in ids {
  let dir = coversDir.appendingPathComponent(id)
  guard let cover = load(dir.appendingPathComponent("cover.webp")) else { continue }
  let t0 = DispatchTime.now()

  let text = VNRecognizeTextRequest()
  text.recognitionLevel = .accurate
  text.usesLanguageCorrection = true
  let hands = VNDetectHumanHandPoseRequest()
  hands.maximumHandCount = 4
  let people = VNDetectHumanRectanglesRequest()
  let classify = VNClassifyImageRequest()
  try? VNImageRequestHandler(cgImage: cover, options: [:]).perform([text, hands, people, classify])

  let lines: [[String: Any]] = (text.results ?? []).compactMap { o in
    guard let c = o.topCandidates(1).first else { return nil }
    let b = o.boundingBox
    return [
      "text": c.string, "conf": Double(c.confidence),
      "box": [Double(b.minX), Double(b.minY), Double(b.width), Double(b.height)],
    ]
  }
  let record: [String: Any] = [
    "ms": ms(t0),
    "size": [cover.width, cover.height],
    "ocr": lines,
    "hands": (hands.results ?? []).filter { $0.confidence > 0.3 }.count,
    "people": (people.results ?? []).filter { $0.confidence > 0.3 }.count,
    "classify": (classify.results ?? []).filter { $0.confidence > 0.05 }.prefix(10)
      .map { ["label": $0.identifier, "conf": Double($0.confidence)] as [String: Any] },
  ]
  let data = try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: dir.appendingPathComponent("vision.json"))
  written += 1
  print(String(format: "%6.0fms  %@  %d lines, %d hands, %d people", record["ms"] as! Double, id, lines.count,
    record["hands"] as! Int, record["people"] as! Int))
}
print("wrote \(written) vision.json files")
