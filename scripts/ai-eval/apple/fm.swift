// ai-eval bridge to Apple's on-device model (Foundation Models, image input from macOS 27, needs
// Apple Intelligence turned on). Reads one JSON request per line on stdin, answers one JSON line on
// stdout, so the harness can keep it running for a whole pass. Dev tooling only; nothing ships.
//
//   swiftc -O -parse-as-library -o tmp/ai-eval-fm scripts/ai-eval/apple/fm.swift
//   request:  {"image": "/abs/preview.jpg" | null, "instructions": "...", "prompt": "..."}
//   reply:    {"text": "...", "ms": 1234}  or  {"error": "..."}
//
// Plain text only: the guided-generation macros need Xcode's macro plugin, which the Command Line
// Tools don't have (design/research/native-vs-electron.md). Sampling is greedy, so passes repeat.
import Foundation
import FoundationModels

struct Request: Decodable {
  let image: String?
  let instructions: String
  let prompt: String
}

func reply(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

@main struct Bridge {
  static func main() async {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else {
      reply(["error": "unavailable: \(model.availability)"])
      return
    }
    reply(["ready": true])
    while let line = readLine() {
      guard let data = line.data(using: .utf8), let req = try? JSONDecoder().decode(Request.self, from: data) else {
        reply(["error": "bad request"])
        continue
      }
      let t0 = Date()
      let session = LanguageModelSession(instructions: req.instructions)
      do {
        let response: LanguageModelSession.Response<String>
        if let image = req.image {
          response = try await session.respond(options: GenerationOptions(samplingMode: .greedy)) {
            Attachment(imageURL: URL(fileURLWithPath: image))
            req.prompt
          }
        } else {
          response = try await session.respond(to: req.prompt, options: GenerationOptions(samplingMode: .greedy))
        }
        reply(["text": response.content, "ms": Int(Date().timeIntervalSince(t0) * 1000)])
      } catch {
        reply(["error": "\(error)", "ms": Int(Date().timeIntervalSince(t0) * 1000)])
      }
    }
  }
}
