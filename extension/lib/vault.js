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

/** Options page: pick the vault folder. Must be called from a user gesture. */
export async function pickVault() {
  const handle = await window.showDirectoryPicker({ id: 'intake-vault', mode: 'readwrite' })
  await idbSet('vault', handle)
  return handle
}

export async function getVault() {
  return (await idbGet('vault')) ?? null
}

/** True when we hold a usable readwrite grant; re-prompts (needs a user gesture) if lapsed. */
export async function ensurePermission(handle, { request = true } = {}) {
  if (!handle) return false
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  if (!request) return false
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Write text or binary data to a vault-relative path, creating folders as needed.
 *  Returns the path actually written (uniquified with -2, -3… unless overwrite). */
export async function writeFile(root, relPath, data, { overwrite = false } = {}) {
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
