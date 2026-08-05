// Page extractor, injected on demand via chrome.scripting.executeScript. Bundled by esbuild
// (Defuddle + Turndown ride along) so the page needs no network access and the extension
// needs no static content script. The IIFE's return value is the injection result.
//
// Returns { url, title, selection, articleMd, images[] }.

import Defuddle from 'defuddle'
import TurndownService from 'turndown'

;(() => {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', hr: '---' })

  const selection = String(window.getSelection() || '').trim()

  let title = document.title
  let articleMd = ''
  try {
    // Defuddle wants a Document; give it a CLONE so stripping chrome out of the article
    // never mutates the page the user is looking at.
    const result = new Defuddle(document.cloneNode(true), { url: location.href }).parse()
    if (result?.title) title = result.title
    if (result?.content) articleMd = td.turndown(result.content)
  } catch {
    // Defuddle striking out is fine — the capture falls back to URL + selection.
  }

  const images = Array.from(document.images)
    .filter((img) => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      return w > 80 && h > 80 && img.src && !img.src.startsWith('data:')
    })
    .map((img) => ({ src: img.src, alt: img.alt || '' }))
    .slice(0, 24)

  return { url: location.href, title, selection, articleMd, images }
})()
