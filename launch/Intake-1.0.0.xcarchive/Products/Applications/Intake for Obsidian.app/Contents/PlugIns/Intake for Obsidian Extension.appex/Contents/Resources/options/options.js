import { pickVault, pickVaultFolder, getVault, ensurePermission, hasNativeVaultAccess } from '../lib/vault.js'
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
    } catch (err) {
      // Dismissing the picker is silent; a real failure from the native side is not.
      if (err.message && err.message !== 'picker dismissed') flash(err.message)
    }
  })

  // Subfolders use the SAME system dialog as the vault — Chrome via the FSA picker,
  // Safari via the native handler's NSOpenPanel opened at the vault. The chosen folder
  // must live inside the vault, and what's stored is its vault-relative path (that's
  // what capture paths and Obsidian links are built from).
  const wireFolderPicker = (buttonId, displayId, settingKey) => {
    $(buttonId).addEventListener('click', async () => {
      const vault = await getVault()
      if (!vault) {
        flash('Choose your vault first')
        return
      }

      let relPath
      if (!hasNativeVaultAccess) {
        try {
          relPath = await pickVaultFolder()
        } catch (err) {
          flash(err.message)
          return
        }
        if (relPath === null) return // panel dismissed
      } else {
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
        relPath = rel.join('/')
      }

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
