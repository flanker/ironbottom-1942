import SwiftUI
import UIKit
import WebKit

/// Owns the web view the game runs in. The page is the website's index.html, copied into the bundle under web/ by
/// build-web.sh and served from the ironbottom:// scheme so fetch(), decodeAudioData and localStorage work as online.
final class GameController: NSObject, WKScriptMessageHandler {
    private var webView: WKWebView?
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notify = UINotificationFeedbackGenerator()
    private let select = UISelectionFeedbackGenerator()

    func makeWebView() -> WKWebView {
        if let webView { return webView }
        let config = WKWebViewConfiguration()
        let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        config.setURLSchemeHandler(BundleSchemeHandler(root: root), forURLScheme: "ironbottom")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Text interaction stays on so the room-code box takes typing; the page itself turns off selection, the loupe
        // and callouts everywhere else, since long presses are for the guns.
        config.preferences.isTextInteractionEnabled = true
        let scripts = config.userContentController
        scripts.add(WeakMessageHandler(self), name: "haptic")
        // Tells the page it is inside the app: touch layout, haptics, background pause.
        scripts.addUserScript(WKUserScript(source: "window.__IBS_APP = 'ios';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // No pinch or double-tap zoom.
        scripts.addUserScript(WKUserScript(
            source: "document.querySelector('meta[name=viewport]').setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');",
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { view.isInspectable = true }
        #endif
        view.load(URLRequest(url: URL(string: "ironbottom://app/index.html")!))
        [light, medium, heavy, rigid].forEach { $0.prepare() }
        webView = view
        return view
    }

    func background() { webView?.evaluateJavaScript("window.__ibsBackground && window.__ibsBackground()") }
    func foreground() { webView?.evaluateJavaScript("window.__ibsForeground && window.__ibsForeground()") }

    // haptic(kind) from the page
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let kind = message.body as? String else { return }
        switch kind {
        case "light": light.impactOccurred()
        case "medium": medium.impactOccurred()
        case "heavy": heavy.impactOccurred(intensity: 1)
        case "hit": rigid.impactOccurred()
        case "hitHeavy": heavy.impactOccurred(intensity: 1); rigid.impactOccurred()
        case "torp": notify.notificationOccurred(.error)
        case "success": notify.notificationOccurred(.success)
        case "select": select.selectionChanged()
        default: break
        }
    }
}

/// The content controller retains its handlers; this keeps it from retaining the GameController.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Serves ironbottom://app/<path> from the bundled web/ folder.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private static let types = [
        "html": "text/html; charset=utf-8", "js": "text/javascript", "css": "text/css", "mp3": "audio/mpeg",
        "woff2": "font/woff2", "png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml", "json": "application/json",
    ]

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        let headers = ["Content-Type": Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream", "Content-Length": String(data.count)]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

struct GameWebView: UIViewRepresentable {
    let controller: GameController
    func makeUIView(context: Context) -> WKWebView { controller.makeWebView() }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
