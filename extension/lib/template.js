// Token expansion for filename and frontmatter templates.
// Tokens: {title} {url} {domain} {date} {time} {tags}

export function expand(template, ctx) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const tokens = {
    title: ctx.title ?? '',
    url: ctx.url ?? '',
    domain: safeDomain(ctx.url),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    tags: (ctx.tags ?? []).map((t) => JSON.stringify(t)).join(', '),
  }
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in tokens ? tokens[key] : m))
}

function safeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A string safe to be a filename in any vault: no path separators or illegal characters. */
export function sanitizeFilename(name) {
  return (
    name
      .replace(/[/\\:*?"<>|#^[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}
