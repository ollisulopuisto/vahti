import Foundation

// The halo hugging the island's outline while something waits, painted by orb.metal from the `glow`
// uniform: how bright it may get and its one-cycle alert pulse, kept here so the maths is testable
// off the GPU. The shader's falloff, exp(-sq(d/4)) points from the outline, is a whisper past `reach`.
enum IslandGlow {
  // The halo's visible reach outside the outline, in points: the window must leave at least this
  // much room around the pill, or the glow is clipped before it can wrap the notch's sides.
  static let reach: CGFloat = 12
  // One breath, out and back, in about two seconds; then still.
  static let cycle: TimeInterval = 1.8
  // Full strength, before the brightness setting scales it. 1.0 is as bright as it ever was.
  static let peak: Float = 0.14

  // The breathing while an unseen notification waits, and the single cycle an alert plays instead of a sound.
  // `level` is Setup's brightness (0.2...1.0); `pulseAge` is the time since the alert, negative
  // before it. The pulse runs exactly one cycle and never repeats.
  static func value(at t: Double, pulseAge: TimeInterval, breathing: Bool, notch: Bool, level: Float) -> Float {
    let peak = peak * level
    let breath = breathing ? peak * (0.5 + 0.5 * Float(sin(t * (notch ? 3.6 : 2.4) - .pi / 2))) : 0
    let once: Float = pulseAge >= 0 && pulseAge < cycle
      ? peak * (0.5 - 0.5 * Float(cos(2 * Double.pi * pulseAge / cycle)))
      : 0
    return max(breath, once)
  }
}
