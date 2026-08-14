import { getVault, ensurePermission, writeFile, openUrl } from '../lib/vault.js'
import { getSettings } from '../lib/settings.js'
import { expand, sanitizeFilename } from '../lib/template.js'

let pageData = { url: '', title: '', selection: '', images: [] }
const selectedImages = new Set()
let vaultHandle = null
let activeTabId = null

const $ = (id) => document.getElementById(id)

// ── Bootstrap ────────────────────────────────────────────────
// The popup opens with #main already visible so the shell paints in one frame. Page data
// comes from a tiny inline probe (milliseconds); the heavy Defuddle bundle only runs if
// "Capture full article" is actually clicked. The vault check races alongside — the rare
// unconfigured open swaps to setup, every other open never waits on IndexedDB.

function sendMessage(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(response)
    })
  })
}

// Serialized into the page by executeScript — must be self-contained. Fallback only:
// mirrors content.js's probe() for tabs the resident script never reached.
function pageProbe() {
  const selection = String(window.getSelection() || '').trim()
  const images = Array.from(document.images)
    .filter((img) => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      return w > 80 && h > 80 && img.src && !img.src.startsWith('data:')
    })
    .map((img) => ({ src: img.src, alt: img.alt || '' }))
    .slice(0, 24)
  return { url: location.href, title: document.title, selection, images }
}

async function init() {
  // The vault check NEVER gates rendering — IndexedDB opens can take tens of ms, and the
  // only thing the result changes is whether the setup screen swaps in. It resolves in
  // parallel; saving re-awaits it if the user is faster than the disk.
  getVault().then((handle) => {
    vaultHandle = handle
    if (!handle) {
      $('main').hidden = true
      $('footer').hidden = true // lives outside #main (fixed under the scroller) — hide it with it
      $('setup').hidden = false
      $('setup-btn').addEventListener('click', () => chrome.runtime.openOptionsPage())
    }
  })

  const probePromise = chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    activeTabId = tab.id
    // Tab metadata is free — the title lands before the probe's page round-trip.
    if (tab.title) $('title-input').value = tab.title
    // Resident content script first: its message round-trip is fast enough that the popup
    // paints once, at its final size (same mechanism as Platinum Capture)…
    try {
      const result = await sendMessage(tab.id, { type: 'PROBE' }, 250)
      if (result) return result
    } catch {
      // …no listener (tab predates the extension) — fall through to injection.
    }
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: pageProbe,
      })
      if (result) return result
    } catch {
      // Pages scripts can't touch (chrome://, store pages): capture URL + title only.
    }
    return { url: tab.url || '', title: tab.title || '', selection: '', images: [] }
  })

  pageData = await probePromise
  render()
}

// ── Render ───────────────────────────────────────────────────

function render() {
  if (pageData.selection) {
    $('text-input').value = pageData.selection
    // A selection is a clear statement of intent — the whole-article path leaves.
    $('article-btn').hidden = true
  }
  $('title-input').value = pageData.title || ''

  const grid = $('image-grid')
  // No images → the section never appears at all.
  if (!pageData.images.length) return
  $('section-image').hidden = false

  for (const img of pageData.images) {
    const thumb = document.createElement('div')
    thumb.className = 'image-thumb'
    const el = document.createElement('img')
    el.src = img.src
    el.alt = img.alt
    el.draggable = false
    el.onerror = () => thumb.remove()
    thumb.appendChild(el)
    thumb.addEventListener('click', () => {
      // Multi-select: every image toggles independently, and each selected image
      // becomes its own attachment on save (uniquify handles the name collisions).
      const on = thumb.classList.toggle('is-selected')
      if (on) selectedImages.add(img.src)
      else selectedImages.delete(img.src)
    })
    grid.appendChild(thumb)
  }
}

// ── Saving ───────────────────────────────────────────────────

function status(msg) {
  $('status').textContent = msg
}

async function ready() {
  if (!vaultHandle) vaultHandle = await getVault() // beat the parallel check to the click
  if (await ensurePermission(vaultHandle)) return true
  status('Vault access was declined. Re-pick the folder in settings.')
  return false
}

function noteContext() {
  const tags = $('tags-input').value.split(',').map((t) => t.trim()).filter(Boolean)
  const title = $('title-input').value.trim() || pageData.title || 'Untitled'
  return { title, tags, url: pageData.url }
}

async function saveImageAttachments(settings) {
  const names = []
  for (const src of selectedImages) {
    const res = await fetch(src)
    if (!res.ok) throw new Error('image fetch failed')
    const blob = await res.blob()
    const extFromType = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' }[blob.type]
    const urlExt = src.split('?')[0].match(/\.(jpe?g|png|gif|webp|avif|svg)$/i)?.[0]
    const ext = extFromType ?? urlExt ?? '.jpg'
    const base = sanitizeFilename(noteContext().title)
    const relPath = [settings.attachmentsFolder, `${base}${ext}`].filter(Boolean).join('/')
    const written = await writeFile(vaultHandle, relPath, blob)
    names.push(written.split('/').pop())
  }
  return names
}

async function saveNote({ body }) {
  if (!(await ready())) return
  const settings = await getSettings()
  const ctx = noteContext()

  status('') // the status line is for errors only; clear any stale one before retrying
  try {
    let markdown = expand(settings.frontmatterTemplate, ctx)

    const imageNames = await saveImageAttachments(settings)
    for (const n of imageNames) markdown += `![[${n}]]\n\n`

    markdown += body

    const filename = sanitizeFilename(expand(settings.filenameTemplate, ctx)) + settings.fileExtension
    const relPath = [settings.notesFolder, filename].filter(Boolean).join('/')
    const written = await writeFile(vaultHandle, relPath, markdown)

    if (settings.openInObsidian) {
      // vaultHandle.name is the vault folder's name, which is what Obsidian calls the
      // vault. Obsidian's file param implies .md — strip ONLY that extension, or Obsidian
      // hunts for a .md twin of an .mdx file and toasts "not found". The pause lets
      // Obsidian notice the externally created file before we ask it to open it.
      const file = written.endsWith('.md') ? written.slice(0, -3) : written
      // Keep path slashes literal — matches the URL shape verified against Obsidian.
      const url = `obsidian://open?vault=${encodeURIComponent(vaultHandle.name)}&file=${encodeURIComponent(file).replace(/%2F/g, '/')}`
      await new Promise((r) => setTimeout(r, 500))
      await openUrl(url)
    }

    setTimeout(() => window.close(), 900)
  } catch (err) {
    status(`Could not save: ${err.message}`)
  }
}

// ── Wiring ───────────────────────────────────────────────────

$('save-btn').addEventListener('click', () => {
  const ctx = noteContext()
  let body = `[${ctx.title}](${pageData.url})\n\n`
  const text = $('text-input').value.trim()
  if (text) body += text.split('\n').map((l) => `> ${l}`).join('\n') + '\n'
  saveNote({ body })
})

$('article-btn').addEventListener('click', async () => {
  // Defuddle + Turndown inject on demand — this is the only path that needs them, and
  // keeping them out of init() is what makes the popup open instantly.
  let articleMd = ''
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ['dist/extract.js'],
    })
    articleMd = result?.articleMd || ''
  } catch {
    // Fall through to the URL-only body below.
  }
  const body = articleMd
    ? `${articleMd}\n\n[Source](${pageData.url})\n`
    : `[${noteContext().title}](${pageData.url})\n`
  saveNote({ body })
})

init()
