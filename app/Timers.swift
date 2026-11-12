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

/// How often the capture side asks the daemon for the capture policy and hands over what it has read.
/// Setup > Capture rhythm; 5 seconds, the old fixed value, unless the owner picks another.
enum FlushPeriod {
  static let key = "vahtiFlushSeconds"
  static let choices = [5, 15, 30, 60]
  static let defaultSeconds = 5

  static var seconds: Int {
    let value = UserDefaults.standard.object(forKey: key) as? Int ?? defaultSeconds
    return choices.contains(value) ? value : defaultSeconds
  }
}
