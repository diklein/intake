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

  $('pick-vault').addEventListener('click', async () => {
    if (!hasNativeVaultAccess) {
      $('vault-name').textContent = 'This browser cannot grant folder access; use the Intake app instead.'
      return
    }
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

  // Subfolders use the SAME system dialog as the vault; the chosen folder must live inside
  // the vault, and what's stored is its vault-relative path (that's what capture paths and
  // Obsidian links are built from).
  const wireFolderPicker = (buttonId, displayId, settingKey) => {
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
