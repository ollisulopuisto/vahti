let fallback = Shortcut.find
precondition(fallback.key == kVK_ANSI_K)
precondition(fallback.modifiers == (cmdKey | optionKey | shiftKey))
precondition(fallback.symbols == "⌥⇧⌘K")
precondition(Shortcut.open.modifiers == (cmdKey | optionKey))
let name = "test-" + UUID().uuidString
let key = "shortcut." + name
defer { UserDefaults.standard.removeObject(forKey: key) }
precondition(Shortcut.saved(name, or: fallback) == fallback)
let legacy = Shortcut(key: kVK_Space, modifiers: cmdKey | optionKey, label: "Space")
Shortcut.save(legacy, as: name)
precondition(Shortcut.saved(name, or: fallback) == legacy)
let custom = Shortcut(key: kVK_ANSI_F, modifiers: cmdKey | shiftKey, label: "F")
Shortcut.save(custom, as: name)
precondition(Shortcut.saved(name, or: fallback) == custom)
Shortcut.save(nil, as: name)
precondition(Shortcut.saved(name, or: fallback) == fallback)
UserDefaults.standard.set(Data("invalid".utf8), forKey: key)
precondition(Shortcut.saved(name, or: fallback) == fallback)
precondition(HotKey.failureMessage(noErr, shortcut: fallback) == nil)
let message = HotKey.failureMessage(OSStatus(-9878), shortcut: fallback)!
precondition(message.contains("⌥⇧⌘K") && message.contains("-9878") && message.contains("Settings"))
print("shortcut defaults, overrides, reset and registration status passed")
