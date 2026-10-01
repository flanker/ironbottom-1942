import AVFoundation
import SwiftUI

/// 铁底湾1942 for iPhone: the website's game, bundled offline in a full-screen landscape web view.
@main
struct IronbottomApp: App {
    @Environment(\.scenePhase) private var phase
    private let game = GameController()

    init() {
        // Play through the silent switch, like most games with their own music.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameWebView(controller: game)
                .ignoresSafeArea()
                .background(Color.black)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                // Edge swipes reach the game first; a second swipe still goes home.
                .defersSystemGestures(on: .all)
        }
        .onChange(of: phase) { _, now in
            switch now {
            case .active: game.foreground()
            case .inactive, .background: game.background()
            @unknown default: break
            }
        }
    }
}
