// Prints the text macOS Live Text (VisionKit) finds in an image, including Japanese.
// Built by host/install.mjs into bin/ocr: swiftc -O ocr/ocr.swift -o bin/ocr -framework VisionKit -framework AppKit
import AppKit
import Foundation
import VisionKit

@available(macOS 13.0, *)
func extractText(from path: String) async throws -> String {
    guard let image = NSImage(contentsOfFile: path) else {
        throw NSError(domain: "ocr", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not load image"])
    }
    let analyzer = ImageAnalyzer()
    let config = ImageAnalyzer.Configuration([.text])
    let analysis = try await analyzer.analyze(image, orientation: .up, configuration: config)
    return analysis.transcript
}

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("Usage: ocr <image-path>\n".data(using: .utf8)!)
    exit(2)
}

guard #available(macOS 13.0, *) else {
    FileHandle.standardError.write("Error: macOS 13 or newer is required.\n".data(using: .utf8)!)
    exit(1)
}

let path = CommandLine.arguments[1]
var done = false, failed = false
Task { @MainActor in
    do {
        print(try await extractText(from: path))
    } catch {
        FileHandle.standardError.write("Error: \(error)\n".data(using: .utf8)!)
        failed = true
    }
    done = true
}
while !done {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
}
exit(failed ? 1 : 0)
