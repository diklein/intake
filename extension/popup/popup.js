import { getVault, ensurePermission, writeFile } from '../lib/vault.js'
import { getSettings } from '../lib/settings.js'
import { expand, sanitizeFilename } from '../lib/template.js'

let pageData = { url: '', title: '', selection: '', articleMd: '', images: [] }
let selectedImageSrc = null
let vaultHandle = null

const $ = (id) => document.getElementById(id)

// ── Bootstrap ────────────────────────────────────────────────

async function init() {
  vaultHandle = await getVault()
  if (!vaultHandle) {
    $('setup').hidden = false
    $('setup-btn').addEventListener('click', () => chrome.runtime.openOptionsPage())
    return
  }
  $('main').hidden = false

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['dist/extract.js'],
    })
    if (result) pageData = result
  } catch {
    // Pages scripts can't touch (chrome://, store pages): capture URL + title only.
    pageData = { url: tab.url || '', title: tab.title || '', selection: '', articleMd: '', images: [] }
  }
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
  const emptyEl = $('image-empty')
  if (!pageData.images.length) {
    emptyEl.textContent = 'No images found on this page'
    return
  }
  emptyEl.remove()
  $('image-count').textContent = `${pageData.images.length} found`

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
      const was = thumb.classList.contains('is-selected')
      grid.querySelectorAll('.is-selected').forEach((t) => t.classList.remove('is-selected'))
      selectedImageSrc = was ? null : img.src
      if (!was) thumb.classList.add('is-selected')
    })
    grid.appendChild(thumb)
  }
}

// ── Saving ───────────────────────────────────────────────────

function status(msg) {
  $('status').textContent = msg
}

async function ready() {
  if (await ensurePermission(vaultHandle)) return true
  status('Vault access was declined. Re-pick the folder in settings.')
  return false
}

function noteContext() {
  const tags = $('tags-input').value.split(',').map((t) => t.trim()).filter(Boolean)
  const title = $('title-input').value.trim() || pageData.title || 'Untitled'
  return { title, tags, url: pageData.url }
}

async function saveImageAttachment(settings) {
  if (!selectedImageSrc) return null
  const res = await fetch(selectedImageSrc)
  if (!res.ok) throw new Error('image fetch failed')
  const blob = await res.blob()
  const extFromType = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' }[blob.type]
  const urlExt = selectedImageSrc.split('?')[0].match(/\.(jpe?g|png|gif|webp|avif|svg)$/i)?.[0]
  const ext = extFromType ?? urlExt ?? '.jpg'
  const base = sanitizeFilename(noteContext().title)
  const relPath = [settings.attachmentsFolder, `${base}${ext}`].filter(Boolean).join('/')
  const written = await writeFile(vaultHandle, relPath, blob)
  return written.split('/').pop()
}

async function saveNote({ body }) {
  if (!(await ready())) return
  const settings = await getSettings()
  const ctx = noteContext()

  status('Saving…')
  try {
    let markdown = expand(settings.frontmatterTemplate, ctx)

    const imageName = await saveImageAttachment(settings)
    if (imageName) markdown += `![[${imageName}]]\n\n`

    markdown += body

    const filename = sanitizeFilename(expand(settings.filenameTemplate, ctx)) + settings.fileExtension
    const relPath = [settings.notesFolder, filename].filter(Boolean).join('/')
    const written = await writeFile(vaultHandle, relPath, markdown)

    if (settings.openInObsidian) {
      // vaultHandle.name is the vault folder's name, which is what Obsidian calls the vault.
      const file = written.replace(/\.mdx?$/, '')
      const url = `obsidian://open?vault=${encodeURIComponent(vaultHandle.name)}&file=${encodeURIComponent(file)}`
      const tab = await chrome.tabs.create({ url, active: false })
      setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 3000)
    }

    status(`Saved ${written}`)
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

$('article-btn').addEventListener('click', () => {
  const body = pageData.articleMd
    ? `${pageData.articleMd}\n\n[Source](${pageData.url})\n`
    : `[${noteContext().title}](${pageData.url})\n`
  saveNote({ body })
})

init()
