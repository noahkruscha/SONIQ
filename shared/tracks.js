import { PROVIDER, AUDIO_EXT } from './constants.js'

/**
 * Track is the single data shape used across device pages, the phone service
 * and the local library:
 * {
 *   id, title, artist, album, duration, provider, source,
 *   audioUrl, artworkUrl, artworkPath, license, spotifyUri, size
 * }
 * `source` is 'local' for anything that can be downloaded to the watch and
 * 'spotify' for catalogue-only Spotify entries.
 */

const SAFE_ID = /[^a-z0-9-]/g

export function makeTrackId(prefix, raw) {
  const slug = String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${prefix}-${slug || 'track'}-${hash(String(raw == null ? '' : raw))}`
}

function hash(input) {
  let h = 5381
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

export function normalizeTrack(raw) {
  const provider = raw.provider || PROVIDER.ARCHIVE
  const source = provider === PROVIDER.SPOTIFY ? 'spotify' : 'local'
  return {
    id: raw.id || makeTrackId(provider.slice(0, 3), raw.audioUrl || raw.title || ''),
    title: String(raw.title || 'Unknown track').slice(0, 120),
    artist: String(raw.artist || 'Unknown artist').slice(0, 120),
    album: String(raw.album || '').slice(0, 120),
    duration: Math.max(0, Math.round(Number(raw.duration) || 0)),
    provider,
    source,
    audioUrl: raw.audioUrl || '',
    artworkUrl: raw.artworkUrl || '',
    artworkPath: raw.artworkPath || '',
    license: raw.license || '',
    spotifyUri: raw.spotifyUri || '',
    size: Math.max(0, Math.round(Number(raw.size) || 0)),
  }
}

export function fileNameForTrack(track) {
  const id = String(track.id || 'track').replace(SAFE_ID, '-')
  return `soniq-${id}${AUDIO_EXT}`
}

export function isDownloadable(track) {
  return Boolean(track && track.source === 'local' && track.audioUrl)
}

export function isSpotify(track) {
  return Boolean(track && track.provider === PROVIDER.SPOTIFY)
}

export function sameTrack(a, b) {
  if (!a || !b) return false
  if (a.id && b.id) return a.id === b.id
  return (
    String(a.title).toLowerCase() === String(b.title).toLowerCase() &&
    String(a.artist).toLowerCase() === String(b.artist).toLowerCase()
  )
}

export function dedupeTracks(list) {
  const seen = new Set()
  const out = []
  for (const track of list || []) {
    if (!track || !track.id) continue
    if (seen.has(track.id)) continue
    seen.add(track.id)
    out.push(track)
  }
  return out
}
