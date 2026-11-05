import {
  AUDIO_MIN_BYTES,
  AUDIO_MAX_BYTES,
  ARTWORK_MIN_BYTES,
  ARTWORK_MAX_BYTES,
  MIN_KBPS,
  MAX_KBPS,
} from './constants.js'

/**
 * Host allowlist for audio. Only sources whose terms allow downloading the
 * file are accepted: Creative Commons music from Jamendo and the Internet
 * Archive. Spotify CDN hosts are deliberately absent - Spotify audio is DRM
 * protected and cannot be stored.
 */
const AUDIO_HOSTS = ['archive.org', 'jamendo.com']
const ARTWORK_HOSTS = [
  'scdn.co',
  'spotifycdn.com',
  'archive.org',
  'jamendo.com',
]

function hostOf(url) {
  const match = /^https:\/\/([^/?#]+)/i.exec(String(url || ''))
  if (!match) return ''
  const host = match[1].toLowerCase()
  if (host.indexOf('@') !== -1) return ''
  if (host.indexOf(':') !== -1) return host.split(':')[0]
  return host
}

function matchesHost(host, suffixes) {
  if (!host) return false
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export function isAllowedAudioUrl(url) {
  return matchesHost(hostOf(url), AUDIO_HOSTS)
}

export function isAllowedArtworkUrl(url) {
  return matchesHost(hostOf(url), ARTWORK_HOSTS)
}

export function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

function toBytes(input) {
  if (!input) return null
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (Array.isArray(input)) return Uint8Array.from(input)
  return null
}

/** MP3 with an ID3 tag, or a raw MPEG audio frame sync. */
export function isMp3Header(input) {
  const bytes = toBytes(input)
  if (!bytes || bytes.length < 4) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true // "ID3"
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true
  return false
}

export function isJpegOrPng(input) {
  const bytes = toBytes(input)
  if (!bytes || bytes.length < 4) return false
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  return isJpeg || isPng
}

export function isAcceptableAudioSize(bytes) {
  const n = Number(bytes) || 0
  return n >= AUDIO_MIN_BYTES && n <= AUDIO_MAX_BYTES
}

export function isAcceptableArtworkSize(bytes) {
  const n = Number(bytes) || 0
  return n >= ARTWORK_MIN_BYTES && n <= ARTWORK_MAX_BYTES
}

export function estimateBitrateKbps(bytes, durationSeconds) {
  const size = Number(bytes) || 0
  const duration = Number(durationSeconds) || 0
  if (size <= 0 || duration <= 0) return 0
  return Math.round((size * 8) / duration / 1000)
}

export function isTargetBitrate(kbps) {
  const n = Number(kbps) || 0
  return n >= MIN_KBPS && n <= MAX_KBPS
}

export function parseLength(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const text = String(value == null ? '' : value).trim()
  if (!text) return 0
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text))
  const parts = text.split(':').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  return 0
}

export function safeJsonParse(text, fallback = null) {
  try {
    if (typeof text !== 'string') return text == null ? fallback : text
    return JSON.parse(text)
  } catch (error) {
    return fallback
  }
}
