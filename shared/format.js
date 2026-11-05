/** Small, dependency-free formatters used by every screen. */

export function clamp(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
  return `${m}:${pad(sec)}`
}

function pad(n) {
  return n < 10 ? `0${n}` : String(n)
}

/** Watch-friendly size string: 912 K, 4.2 M, 1.1 G. */
export function formatBytes(bytes, decimals = 1) {
  const n = Number(bytes) || 0
  if (n <= 0) return '0 K'
  if (n >= 1024 * 1024 * 1024) return `${trim(n / (1024 * 1024 * 1024), decimals)} G`
  if (n >= 1024 * 1024) return `${trim(n / (1024 * 1024), decimals)} M`
  return `${Math.round(n / 1024)} K`
}

function trim(n, decimals) {
  const fixed = n.toFixed(decimals)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

export function percent(part, total) {
  const t = Number(total) || 0
  if (t <= 0) return 0
  return clamp(Math.round((Number(part) / t) * 100), 0, 100)
}

export function formatCount(n) {
  const v = Number(n) || 0
  if (v >= 1000000) return `${trim(v / 1000000, 1)}M`
  if (v >= 1000) return `${trim(v / 1000, 1)}K`
  return String(v)
}

export function truncate(text, maxChars) {
  const str = String(text == null ? '' : text)
  if (str.length <= maxChars) return str
  if (maxChars <= 1) return str.slice(0, maxChars)
  return `${str.slice(0, maxChars - 1)}\u2026`
}

export function titleCase(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
