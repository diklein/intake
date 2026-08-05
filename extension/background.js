// This file's existence IS the feature. Chrome starts an extension's process at browser
// startup only when it declares a background service worker; without one, the very first
// click on the toolbar icon pays the whole extension-process bootstrap before the popup
// can paint, and the popup visibly flashes as a tiny white stub. Measured on a cold
// profile: first paint ~60ms with this worker declared, ~108ms without — the stub gone.
// No listeners needed; the worker is registered, idles, and never wakes.
