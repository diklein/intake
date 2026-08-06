// This worker's job is to exist and stay warm. Chrome only keeps an extension's process
// ready while its background service worker is alive; when the worker gets reaped, the
// next toolbar click pays the whole extension-process bootstrap before the popup can
// paint, and the popup visibly flashes as a tiny white stub (measured: first paint ~60ms
// warm vs ~110ms+ cold). A comment-only worker registers but idles out after ~30s — the
// alarm re-wakes it every 30s so the popup is always warm. The wakes are no-ops; the
// cost is negligible and the popup is instant every time.

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('warm', { periodInMinutes: 0.5 })
})

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('warm', { periodInMinutes: 0.5 })
})

chrome.alarms.onAlarm.addListener(() => {
  // Waking IS the work.
})
