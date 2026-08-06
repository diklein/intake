// The vault, via the File System Access API. The user picks their Obsidian vault folder
// once (options page); the directory handle persists in IndexedDB and every capture writes
// straight into the vault — no downloads, no staging, no companion process.
//
// Safari note: Safari has no File System Access API for directories. There the same calls
// are routed to the containing app's native handler (see safari/), which holds a
// security-scoped bookmark to the vault. The popup only ever talks to this module.

const DB_NAME = 'intake'
const STORE = 'handles'

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const hasNativeVaultAccess = typeof window.showDirectoryPicker === 'function'

// ── Safari backend ───────────────────────────────────────────
// Safari has no File System Access API, so the same operations route to the containing
// app's native handler over sendNativeMessage. The vault is chosen in the Intake app
// (NSOpenPanel); the handler holds the path and does the writes. The pseudo-handle
// carries { native, name } so popup code (vaultHandle.name for obsidian://) still works.

function native(message) {
  // Safari routes to the extension's own containing app regardless of the id argument.
  return browser.runtime.sendNativeMessage('com.diklein.intake', message)
}

async function nativeGetVault() {
  try {
    const r = await native({ action: 'get-vault' })
    return r && r.name ? { native: true, name: r.name, path: r.path } : null
  } catch {
    return null
  }
}

async function nativeWriteFile(relPath, data, overwrite) {
  const message = { action: 'write-file', relPath, overwrite }
  if (typeof data === 'string') {
    message.text = data
  } else {
    // Native messaging is JSON-only — binary rides as base64.
    const buf = await data.arrayBuffer()
    let s = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    message.b64 = btoa(s)
  }
  const r = await native(message)
  if (!r || r.error) throw new Error(r?.error || 'native write failed')
  return r.written
}

/** Options page: pick the vault folder. Must be called from a user gesture. */
export async function pickVault() {
  if (!hasNativeVaultAccess) {
    // Safari: the native handler shows NSOpenPanel and keeps a security-scoped bookmark.
    const r = await native({ action: 'pick-vault' })
    if (!r || !r.name) throw new Error(r?.error || 'picker dismissed')
    return { native: true, name: r.name, path: r.path }
  }
  const handle = await window.showDirectoryPicker({ id: 'intake-vault', mode: 'readwrite' })
  await idbSet('vault', handle)
  return handle
}

/** Safari options page: pick a folder INSIDE the vault via the native panel.
 *  Resolves to the vault-relative path ('' = vault root), null if dismissed;
 *  throws if the chosen folder is outside the vault. */
export async function pickVaultFolder() {
  const r = await native({ action: 'pick-folder' })
  if (r && r.error) throw new Error(r.error)
  return r && typeof r.rel === 'string' ? r.rel : null
}

/** Open an obsidian:// URL without spawning a new tab. Safari routes to the native
 *  handler (NSWorkspace — no tab and no "allow this website to open" dialog). Chrome
 *  navigates the EXISTING active tab: external-protocol navigations never commit, so the
 *  page stays put while the OS launches Obsidian. (A hidden iframe does not work — Chrome
 *  silently blocks external protocols from subframes without fresh user activation.) */
export async function openUrl(url) {
  if (!hasNativeVaultAccess) {
    await native({ action: 'open-url', url }).catch(() => {})
    return
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) await chrome.tabs.update(tab.id, { url }).catch(() => {})
}

export async function getVault() {
  if (!hasNativeVaultAccess) return nativeGetVault()
  return (await idbGet('vault')) ?? null
}

/** True when we hold a usable readwrite grant; re-prompts (needs a user gesture) if lapsed. */
export async function ensurePermission(handle, { request = true } = {}) {
  if (!handle) return false
  if (handle.native) return true // the native handler re-verifies the vault on every write
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  if (!request) return false
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Write text or binary data to a vault-relative path, creating folders as needed.
 *  Returns the path actually written (uniquified with -2, -3… unless overwrite). */
export async function writeFile(root, relPath, data, { overwrite = false } = {}) {
  if (root.native) return nativeWriteFile(relPath, data, overwrite)

  const parts = relPath.split('/').filter(Boolean)
  let name = parts.pop()
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true })

  if (!overwrite) name = await uniquify(dir, name)
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
  return [...parts, name].join('/')
}

async function uniquify(dir, name) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let candidate = name
  for (let n = 2; ; n++) {
    try {
      await dir.getFileHandle(candidate)
      candidate = `${base}-${n}${ext}`
    } catch {
      return candidate // no such file — the name is free
    }
  }
}
