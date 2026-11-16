import Foundation
import Observation

// One in-flight decision per detail panel. A successful source launch is not proof of task completion.
@MainActor @Observable final class DetailActionState {
  private(set) var busy = false
  var error: String?

  func run(open: (() async -> String?)? = nil, mark: () async -> Bool, finished: () -> Void) async {
    guard !busy else { return }
    busy = true
    error = nil
    defer { busy = false }
    if let open, let why = await open() {
      error = "Could not open the source: \(why). The card is still waiting."
      return
    }
    guard await mark() else {
      error = open == nil ? "Could not save that change. Try again." : "The source opened, but Vahti could not mark the card done. It is still waiting."
      return
    }
    finished()
  }
}
