import Foundation
import ImageIO
import Vision

/// An image read from disk, with the orientation its metadata asks for.
struct LoadedImage {
  let image: CGImage
  let orientation: CGImagePropertyOrientation

  var width: Int { image.width }
  var height: Int { image.height }
}

/// Reads the first image in a file with ImageIO (JPEG, PNG, WebP, HEIC and the rest). A missing file
/// is `not_found`, anything ImageIO can't decode is `unreadable_image`.
func loadImage(_ path: String) throws -> LoadedImage {
  var isDirectory: ObjCBool = false
  guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), !isDirectory.boolValue else {
    throw HelperError("not_found", "no file at \(path)")
  }
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    CGImageSourceGetCount(source) > 0,
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    throw HelperError("unreadable_image", "can't read an image from \(path)")
  }
  var orientation = CGImagePropertyOrientation.up
  if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
    let raw = properties[kCGImagePropertyOrientation] as? UInt32,
    let parsed = CGImagePropertyOrientation(rawValue: raw)
  {
    orientation = parsed
  }
  return LoadedImage(image: image, orientation: orientation)
}

/// Runs Vision requests on one image. A Vision failure is `vision_failed`.
func perform(_ requests: [VNRequest], on image: LoadedImage) throws {
  let handler = VNImageRequestHandler(cgImage: image.image, orientation: image.orientation, options: [:])
  do {
    try handler.perform(requests)
  } catch {
    throw HelperError("vision_failed", "\(error.localizedDescription)")
  }
}

/// A Vision rectangle (normalised, origin bottom-left) as `[x, y, width, height]` with the origin
/// top-left, the way image and web coordinates run, clipped to the image (Vision can overshoot).
func topLeftBox(_ rect: CGRect) -> [Double] {
  let clipped = rect.standardized.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
  guard !clipped.isNull else { return [0, 0, 0, 0] }
  return [
    num(Double(clipped.minX)), num(Double(1 - clipped.maxY)), num(Double(clipped.width)),
    num(Double(clipped.height)),
  ]
}
