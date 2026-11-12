import Foundation

extension Timer {
  /// A repeating timer macOS may fire a little late, so it can share a wakeup with other work instead of
  /// waking the CPU on its own. The tolerance is a quarter of the interval.
  @discardableResult
  static func coalesced(every interval: TimeInterval, _ block: @escaping @Sendable (Timer) -> Void) -> Timer {
    let timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true, block: block)
    timer.tolerance = interval * 0.25
    return timer
  }
}
