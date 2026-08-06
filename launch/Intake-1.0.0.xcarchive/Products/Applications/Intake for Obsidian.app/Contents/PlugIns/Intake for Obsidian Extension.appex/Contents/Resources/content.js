// Resident page probe — mirrors Platinum Capture's content.js pattern: the popup asks for
// page data over a message instead of injecting a script. The message round-trip beats the
// injection round-trip by enough that the popup paints once, at its final size, instead of
// growing when the image section arrives. The heavy Defuddle bundle still injects on demand.

function probe() {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'PROBE') sendResponse(probe())
})
