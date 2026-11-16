import Foundation
import Security
import CryptoKit

// The Todoist API token behind Send to Todoist. It lives only in the Keychain, with an ACL that
// lets this signed Vahti read it without a prompt and offers no other process an interactive grant.
// No file, environment variable, CLI call, log line or diagnostic ever carries it: the app writes
// it from Setup, and the daemon reads it over its inherited pipe, one send at a time.
final class TodoistKeychain: @unchecked Sendable {
  static let shared = TodoistKeychain()
  private let service: String
  private let account: String
  init(directory: String? = nil, bundled: Bool? = nil) {
    let resources = Bundle.main.resourcePath ?? ""
    let isBundled = bundled ?? FileManager.default.fileExists(atPath: resources + "/daemon/bin/vahti.mjs")
    // The same directory main.swift hands the daemon's vault: the app's own environment first.
    let dir = directory ?? ProcessInfo.processInfo.environment["VAHTI_DATA_DIR"]
      ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Library/Application Support/Vahti")
    let digest = SHA256.hash(data: Data(dir.utf8)).map { String(format: "%02x", $0) }.joined()
    service = "to.sulopuis.vahti.todoist." + digest.prefix(16) + (isBundled ? ".native-v1" : ".development-v1")
    account = isBundled ? "api-token" : "development-api-token"
  }
  private func trustedAccess() throws -> SecAccess {
    var code: SecCode?
    var info: CFDictionary?
    var staticCode: SecStaticCode?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code,
          SecCodeCheckValidity(code, [], nil) == errSecSuccess,
          SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
          SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
          let details = info as? [String: Any],
          details[kSecCodeInfoIdentifier as String] as? String == "to.sulopuis.vahti",
          let team = details[kSecCodeInfoTeamIdentifier as String] as? String, !team.isEmpty,
          let path = Bundle.main.executablePath else { throw URLError(.noPermissionsToReadFile) }
    var app: SecTrustedApplication?
    var access: SecAccess?
    guard SecTrustedApplicationCreateFromPath(path, &app) == errSecSuccess, let app,
          SecAccessCreate("Vahti Todoist" as CFString, [app] as CFArray, &access) == errSecSuccess,
          let access else { throw URLError(.noPermissionsToReadFile) }
    return access
  }
  private var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
  }
  // The token, or nil when none is saved. A Keychain failure reads as "no token": the send then
  // asks for Setup instead of mistaking a locked store for a refusal.
  func read() -> String? {
    SecKeychainSetUserInteractionAllowed(false)
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true]) { _, b in b } as CFDictionary, &value)
    guard status == errSecSuccess, let data = value as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
  var hasToken: Bool { read() != nil }
  // Saved from Setup. Delete then create so every new token receives exactly our signed ACL.
  @discardableResult
  func save(_ token: String) -> Bool {
    guard let access = try? trustedAccess(), !token.isEmpty, token.utf8.count <= 200,
          token.range(of: "^[A-Za-z0-9._~+/-]+$", options: .regularExpression) != nil else { return false }
    // Never offer another process an interactive grant to this credential.
    SecKeychainSetUserInteractionAllowed(false)
    let deleted = SecItemDelete(query as CFDictionary)
    guard deleted == errSecSuccess || deleted == errSecItemNotFound else { return false }
    let attributes = query.merging([kSecValueData as String: Data(token.utf8), kSecAttrAccess as String: access]) { _, b in b }
    return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
  }
  func clear() {
    SecKeychainSetUserInteractionAllowed(false)
    SecItemDelete(query as CFDictionary)
  }
}
