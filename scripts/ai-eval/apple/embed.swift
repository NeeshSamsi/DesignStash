// Sentence vectors from macOS's built-in NaturalLanguage models, for the eval's meaning-search test.
//
//   swiftc -O scripts/ai-eval/apple/embed.swift -o /tmp/ds-embed
//   /tmp/ds-embed sentence in.json out.json      (NLEmbedding.sentenceEmbedding, English)
//   /tmp/ds-embed contextual in.json out.json    (NLContextualEmbedding, mean of the token vectors)
//
// in.json is a JSON array of strings; out.json is an array of vectors (null where a text gets none).
// Prints the model dimension and the milliseconds per text on stderr.
import Foundation
import NaturalLanguage

let args = CommandLine.arguments
guard args.count == 4 else {
  FileHandle.standardError.write(Data("usage: ds-embed sentence|contextual in.json out.json\n".utf8))
  exit(2)
}
let texts = try JSONDecoder().decode([String].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
var out: [[Double]?] = []
let start = Date()

if args[1] == "sentence" {
  guard let model = NLEmbedding.sentenceEmbedding(for: .english) else {
    FileHandle.standardError.write(Data("no English sentence embedding on this Mac\n".utf8))
    exit(1)
  }
  FileHandle.standardError.write(Data("sentence dimension \(model.dimension)\n".utf8))
  for t in texts { out.append(model.vector(for: t)) }
} else {
  guard let model = NLContextualEmbedding(language: .english) else {
    FileHandle.standardError.write(Data("no contextual embedding for English\n".utf8))
    exit(1)
  }
  if !model.hasAvailableAssets {
    let sem = DispatchSemaphore(value: 0)
    model.requestAssets { result, error in
      FileHandle.standardError.write(Data("assets: \(result.rawValue) \(String(describing: error))\n".utf8))
      sem.signal()
    }
    sem.wait()
  }
  try model.load()
  FileHandle.standardError.write(Data("contextual dimension \(model.dimension)\n".utf8))
  for t in texts {
    guard let result = try? model.embeddingResult(for: t, language: .english) else {
      out.append(nil)
      continue
    }
    var sum = [Double](repeating: 0, count: model.dimension)
    var n = 0.0
    result.enumerateTokenVectors(in: t.startIndex..<t.endIndex) { vector, _ in
      for i in 0..<sum.count { sum[i] += vector[i] }
      n += 1
      return true
    }
    out.append(n > 0 ? sum.map { $0 / n } : nil)
  }
}
let ms = Date().timeIntervalSince(start) * 1000 / Double(max(texts.count, 1))
FileHandle.standardError.write(Data(String(format: "%.2f ms per text\n", ms).utf8))
try JSONEncoder().encode(out).write(to: URL(fileURLWithPath: args[3]))
