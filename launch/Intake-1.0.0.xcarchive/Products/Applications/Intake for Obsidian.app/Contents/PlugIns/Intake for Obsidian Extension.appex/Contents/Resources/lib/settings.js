// Capture settings, chrome.storage.sync so they follow the user across machines.
// The frontmatter template is the whole personality of a capture: the defaults make
// ordinary Obsidian notes, and any static-site publishing flow is just a different
// template (different folder, different fields, .mdx extension).

export const DEFAULTS = {
  notesFolder: '',            // vault-relative; '' = vault root
  attachmentsFolder: 'attachments',
  fileExtension: '.md',
  filenameTemplate: '{title}',
  frontmatterTemplate: [
    '---',
    'title: "{title}"',
    'source: {url}',
    'date: {date}',
    'tags: [{tags}]',
    '---',
    '',
    '',
  ].join('\n'),
  openInObsidian: true,
}

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch)
}
