import { pickVault, getVault, hasNativeVaultAccess } from '../lib/vault.js'
import { DEFAULTS, getSettings, saveSettings } from '../lib/settings.js'

const $ = (id) => document.getElementById(id)

const FIELDS = {
  'notes-folder': 'notesFolder',
  'attachments-folder': 'attachmentsFolder',
  'file-extension': 'fileExtension',
  'filename-template': 'filenameTemplate',
  'frontmatter-template': 'frontmatterTemplate',
}

async function init() {
  const vault = await getVault()
  $('vault-name').textContent = vault ? vault.name : 'No vault chosen yet'

  const settings = await getSettings()
  for (const [id, key] of Object.entries(FIELDS)) $(id).value = settings[key]
  $('open-in-obsidian').checked = settings.openInObsidian

  $('pick-vault').addEventListener('click', async () => {
    if (!hasNativeVaultAccess) {
      $('vault-name').textContent = 'This browser cannot grant folder access; use the Intake app instead.'
      return
    }
    try {
      const handle = await pickVault()
      $('vault-name').textContent = handle.name
      flash('Vault set')
    } catch {
      /* picker dismissed */
    }
  })

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
