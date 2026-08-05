import { pickVault, getVault, ensurePermission, hasNativeVaultAccess } from '../lib/vault.js'
import { DEFAULTS, getSettings, saveSettings } from '../lib/settings.js'

const $ = (id) => document.getElementById(id)

const FIELDS = {
  'file-extension': 'fileExtension',
  'filename-template': 'filenameTemplate',
  'frontmatter-template': 'frontmatterTemplate',
}

function folderLabel(rel) {
  return rel ? rel : 'Vault root'
}

async function init() {
  const vault = await getVault()
  $('vault-name').textContent = vault ? vault.name : 'No vault chosen yet'

  const settings = await getSettings()
  for (const [id, key] of Object.entries(FIELDS)) $(id).value = settings[key]
  $('notes-folder-name').textContent = vault ? folderLabel(settings.notesFolder) : ''
  $('attachments-folder-name').textContent = vault ? folderLabel(settings.attachmentsFolder) : ''
  $('open-in-obsidian').checked = settings.openInObsidian

  // Works in both browsers: Chrome shows the FSA directory picker, Safari routes to the
  // native handler's NSOpenPanel. Either way pickVault() resolves with the chosen vault.
  $('pick-vault').addEventListener('click', async () => {
    try {
      const handle = await pickVault()
      $('vault-name').textContent = handle.name
      const s = await getSettings()
      $('notes-folder-name').textContent = folderLabel(s.notesFolder)
      $('attachments-folder-name').textContent = folderLabel(s.attachmentsFolder)
      flash('Vault set')
    } catch {
      /* picker dismissed */
    }
  })

  // Safari can't show directory pickers from a web page — the folder settings degrade to
  // typed vault-relative paths (the native handler creates missing folders on write).
  const swapPickerForInput = (buttonId, settingKey) => {
    const row = $(buttonId).closest('.picker-row')
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'field'
    input.placeholder = 'Vault root'
    input.value = settings[settingKey]
    input.addEventListener('change', async () => {
      const rel = input.value.trim().replace(/^\/+|\/+$/g, '')
      input.value = rel
      await saveSettings({ [settingKey]: rel })
      flash('Saved')
    })
    row.replaceChildren(input)
  }
  if (!hasNativeVaultAccess) {
    swapPickerForInput('pick-notes', 'notesFolder')
    swapPickerForInput('pick-attachments', 'attachmentsFolder')
  }

  // Subfolders use the SAME system dialog as the vault; the chosen folder must live inside
  // the vault, and what's stored is its vault-relative path (that's what capture paths and
  // Obsidian links are built from).
  const wireFolderPicker = (buttonId, displayId, settingKey) => {
    if (!hasNativeVaultAccess) return
    $(buttonId).addEventListener('click', async () => {
      const vault = await getVault()
      if (!vault) {
        flash('Choose your vault first')
        return
      }
      if (!(await ensurePermission(vault))) return
      let handle
      try {
        handle = await window.showDirectoryPicker({ startIn: vault, mode: 'read' })
      } catch {
        return // picker dismissed
      }
      const rel = await vault.resolve(handle)
      if (rel === null) {
        flash('That folder is outside your vault')
        return
      }
      const relPath = rel.join('/')
      await saveSettings({ [settingKey]: relPath })
      $(displayId).textContent = folderLabel(relPath)
      flash('Saved')
    })
  }
  wireFolderPicker('pick-notes', 'notes-folder-name', 'notesFolder')
  wireFolderPicker('pick-attachments', 'attachments-folder-name', 'attachmentsFolder')

  for (const [id, key] of Object.entries(FIELDS)) {
    $(id).addEventListener('change', async () => {
      const value = $(id).value || DEFAULTS[key]
      $(id).value = value
      await saveSettings({ [key]: value })
      flash('Saved')
    })
  }
  $('open-in-obsidian').addEventListener('change', async (e) => {
    await saveSettings({ openInObsidian: e.target.checked })
    flash('Saved')
  })
}

let flashTimer
function flash(msg) {
  $('saved').textContent = msg
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => ($('saved').textContent = ''), 1500)
}

init()
