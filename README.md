# Intake for Obsidian

Capture the web into your Obsidian vault. A browser extension for Chrome and Safari that writes notes, selections, images, and full articles straight into the vault as clean Markdown — no companion app, no staging folders, no sync service.

## How it works

1. Install the extension and point it at your Obsidian vault folder (one-time picker).
2. Capture from any page: the toolbar popup takes a note, a selected image, a title, and tags; "Clip full article" extracts the whole page as clean Markdown via [Defuddle](https://github.com/kepano/defuddle).
3. Intake writes the finished `.md` file (and any image attachment) directly into your vault. Obsidian sees it instantly.

Filenames, folders, and the note's frontmatter are all templates in the settings page — the defaults make ordinary Obsidian notes, and any static-site publishing flow is just a different template.

## Install (Chrome, unpacked)

```
npm install
npm run build
```

Then `chrome://extensions` → enable Developer mode → Load unpacked → choose the **`extension/` folder** (not the repo root — the manifest lives inside it). Open the extension's settings to pick your vault.

## Safari

The Safari version wraps the same extension in a small Mac app (Safari has no folder-access API, so the app holds the vault permission natively). Build instructions coming with the first release.

## Permissions

- **Your vault folder** — granted by you via the folder picker; Intake only ever writes inside it.
- **Active tab / scripting** — to read the page you're capturing, only when you invoke it.
- **All sites** — solely so a selected image can be fetched for saving into the vault.

## License

MIT
