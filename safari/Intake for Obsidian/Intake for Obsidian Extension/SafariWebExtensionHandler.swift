//
//  SafariWebExtensionHandler.swift
//  Intake for Obsidian Extension
//
//  Safari's stand-in for the File System Access API. The extension's vault.js routes
//  pick-vault / get-vault / write-file here over native messaging. The vault is chosen
//  through NSOpenPanel (powerbox-mediated, user-selected file access) and persists as a
//  security-scoped bookmark in this extension's own container — the same consent model
//  Chrome's showDirectoryPicker provides, no broad file entitlements involved.
//

import AppKit
import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    static let bookmarkKey = "vaultBookmark"

    static func vaultURL() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: .withSecurityScope,
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        if stale, let refreshed = try? url.bookmarkData(
            options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil
        ) {
            UserDefaults.standard.set(refreshed, forKey: bookmarkKey)
        }
        return url
    }

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]
        let action = message["action"] as? String ?? ""

        switch action {
        case "pick-vault":
            // The open panel is powerbox-hosted (out of process), so a sandboxed extension
            // can present it; the grant belongs to this process and the bookmark keeps it.
            DispatchQueue.main.async {
                let app = NSApplication.shared
                app.activate(ignoringOtherApps: true)
                let panel = NSOpenPanel()
                panel.canChooseDirectories = true
                panel.canChooseFiles = false
                panel.allowsMultipleSelection = false
                panel.message = "Choose your Obsidian vault folder"
                panel.prompt = "Use as Vault"
                var reply: [String: Any] = [:]
                if panel.runModal() == .OK, let url = panel.url {
                    if let bookmark = try? url.bookmarkData(
                        options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil
                    ) {
                        UserDefaults.standard.set(bookmark, forKey: Self.bookmarkKey)
                        reply = ["name": url.lastPathComponent, "path": url.path]
                    } else {
                        reply = ["error": "Could not keep access to that folder"]
                    }
                }
                Self.complete(context, with: reply)
            }
            return

        case "get-vault":
            if let vault = Self.vaultURL() {
                Self.complete(context, with: ["name": vault.lastPathComponent, "path": vault.path])
            } else {
                Self.complete(context, with: [:]) // vault.js treats a nameless reply as unconfigured
            }
            return

        case "write-file":
            Self.complete(context, with: Self.writeFile(message))
            return

        default:
            Self.complete(context, with: ["error": "unknown action"])
            return
        }
    }

    static func complete(_ context: NSExtensionContext, with reply: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    static func writeFile(_ message: [String: Any]) -> [String: Any] {
        guard let vault = vaultURL() else {
            return ["error": "No vault configured — choose it in Intake's settings"]
        }
        guard let relPath = message["relPath"] as? String else {
            return ["error": "missing path"]
        }

        let data: Data
        if let text = message["text"] as? String {
            data = Data(text.utf8)
        } else if let b64 = message["b64"] as? String, let decoded = Data(base64Encoded: b64) {
            data = decoded
        } else {
            return ["error": "missing data"]
        }

        // Vault-relative only — traversal segments are dropped, never resolved.
        let parts = relPath.split(separator: "/").map(String.init)
            .filter { !$0.isEmpty && $0 != "." && $0 != ".." }
        guard !parts.isEmpty else { return ["error": "empty path"] }
        let overwrite = message["overwrite"] as? Bool ?? false

        guard vault.startAccessingSecurityScopedResource() else {
            return ["error": "Vault access lapsed — re-choose the vault in Intake's settings"]
        }
        defer { vault.stopAccessingSecurityScopedResource() }

        let dirURL = parts.count > 1
            ? vault.appendingPathComponent(parts.dropLast().joined(separator: "/"))
            : vault
        do {
            try FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true)
            var name = parts.last!
            if !overwrite { name = uniquify(in: dirURL, name: name) }
            try data.write(to: dirURL.appendingPathComponent(name))
            let written = (parts.dropLast() + [name]).joined(separator: "/")
            return ["written": written]
        } catch {
            return ["error": error.localizedDescription]
        }
    }

    /// Mirrors vault.js's uniquify: name.md, name-2.md, name-3.md…
    static func uniquify(in dir: URL, name: String) -> String {
        let fm = FileManager.default
        if !fm.fileExists(atPath: dir.appendingPathComponent(name).path) { return name }
        let ext = (name as NSString).pathExtension
        let base = (name as NSString).deletingPathExtension
        var n = 2
        while true {
            let candidate = ext.isEmpty ? "\(base)-\(n)" : "\(base)-\(n).\(ext)"
            if !fm.fileExists(atPath: dir.appendingPathComponent(candidate).path) { return candidate }
            n += 1
        }
    }
}
