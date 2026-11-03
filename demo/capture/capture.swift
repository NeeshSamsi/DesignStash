// Records one app window with ScreenCaptureKit: the window only, no cursor, no shadow, Retina pixels.
//
//   capture --pid <pid> --out <file.mov> [--fps 60] [--max-seconds 120]
//
// Prints one line per milestone on stdout: `READY <epoch-ms>` when the first frame lands (the
// scene's clock zero), `SIZE <w> <h>` once, and `DONE <frames>` after SIGINT or SIGTERM has closed
// the file. Needs Screen Recording permission for the process that runs it.
import AppKit
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

func argument(_ name: String) -> String? {
  guard let i = CommandLine.arguments.firstIndex(of: name), i + 1 < CommandLine.arguments.count else {
    return nil
  }
  return CommandLine.arguments[i + 1]
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

guard let pidText = argument("--pid"), let pid = Int32(pidText), let outPath = argument("--out") else {
  fail("usage: capture --pid <pid> --out <file.mov> [--fps 60] [--max-seconds 120]")
}
// ScreenCaptureKit needs a window-server connection, which a bare command-line tool lacks.
_ = NSApplication.shared

let fps = Int(argument("--fps") ?? "60") ?? 60
let maxSeconds = Double(argument("--max-seconds") ?? "120") ?? 120

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
  let writer: AVAssetWriter
  var input: AVAssetWriterInput?
  var adaptor: AVAssetWriterInputPixelBufferAdaptor!
  let size: CGSize
  var started = false
  var firstTime = CMTime.invalid
  var frames = 0
  let queue = DispatchQueue(label: "capture.frames")

  init(url: URL, size: CGSize) throws {
    self.size = size
    try? FileManager.default.removeItem(at: url)
    writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    super.init()
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(size.width),
      AVVideoHeightKey: Int(size.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 60_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ] as [String: Any],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = true
    writer.add(input)
    self.input = input
    adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, buffer.isValid, let input = input else { return }
    // Only frames that carry new pixels have status "complete"; idle and blank ones do not.
    guard
      let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
      let raw = attachments.first?[.status] as? Int,
      SCFrameStatus(rawValue: raw) == .complete
    else { return }
    let time = CMSampleBufferGetPresentationTimeStamp(buffer)
    if !started {
      started = true
      firstTime = time
      writer.startWriting()
      writer.startSession(atSourceTime: .zero)
      print("READY \(Int(Date().timeIntervalSince1970 * 1000))")
      fflush(stdout)
    }
    guard input.isReadyForMoreMediaData, let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
    if adaptor.append(pixels, withPresentationTime: CMTimeSubtract(time, firstTime)) { frames += 1 }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write(Data("stream stopped: \(error)\n".utf8))
  }

  func finish(_ done: @escaping () -> Void) {
    guard started, let input = input else { done(); return }
    input.markAsFinished()
    writer.finishWriting { done() }
  }
}

Task {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    // The app's main window: layer 0, owned by the pid, the largest one.
    let candidates = content.windows.filter {
      $0.owningApplication?.processID == pid && $0.windowLayer == 0 && $0.frame.width > 200
    }
    guard let window = candidates.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
      fail("no window for pid \(pid)")
    }
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let config = SCStreamConfiguration()
    let scale = CGFloat(filter.pointPixelScale)
    let width = Int((window.frame.width * scale).rounded()) & ~1
    let height = Int((window.frame.height * scale).rounded()) & ~1
    config.width = width
    config.height = height
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    config.showsCursor = false
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.capturesAudio = false
    config.queueDepth = 8
    if #available(macOS 14.0, *) {
      config.ignoreShadowsSingleWindow = true
      config.captureResolution = .best
    }
    let recorder = try Recorder(url: URL(fileURLWithPath: outPath), size: CGSize(width: width, height: height))
    let stream = SCStream(filter: filter, configuration: config, delegate: recorder)
    try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: recorder.queue)
    try await stream.startCapture()
    print("SIZE \(width) \(height)")
    fflush(stdout)

    let stop: () -> Void = {
      Task {
        try? await stream.stopCapture()
        recorder.queue.async {
          recorder.finish {
            print("DONE \(recorder.frames)")
            fflush(stdout)
            exit(0)
          }
        }
      }
    }
    for sig in [SIGINT, SIGTERM] {
      signal(sig, SIG_IGN)
      let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
      source.setEventHandler { stop() }
      source.resume()
      signalSources.append(source)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) { stop() }
  } catch {
    fail("capture failed: \(error)")
  }
}
var signalSources: [DispatchSourceSignal] = []
RunLoop.main.run()
