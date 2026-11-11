import Foundation
import CoreGraphics

// Launch uses the physical housing, not the orb's painted width or its future position.
// Retention is deliberately wider, but only after the orb has opened.
enum NotchHover {
  static func launchArea(screen: CGRect, inset: CGFloat, left: CGRect?, right: CGRect?) -> CGRect {
    guard let left, let right, inset > 0, right.minX > left.maxX else { return .zero }
    return CGRect(x: left.maxX, y: screen.maxY - inset, width: right.minX - left.maxX, height: inset)
  }

  static func contains(_ point: CGPoint, launch: CGRect, expanded: Bool, strip: CGRect, orbZone: CGRect) -> Bool {
    // Include the top edge for a cursor thrown to the screen boundary (CGRect.contains excludes maxY).
    let inHousing = launch.width > 0 && launch.height > 0
      && point.x >= launch.minX && point.x <= launch.maxX
      && point.y >= launch.minY && point.y <= launch.maxY
    if inHousing { return true }
    return expanded && (strip.contains(point) || orbZone.contains(point))
  }
}
