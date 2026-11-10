import { PROVIDER } from '../constants.js'
import { makeTrackId } from '../tracks.js'

/**
 * Openverse audio search (no API key). It indexes Creative Commons tracks from
 * Jamendo, FMA and Wikimedia, and returns direct audio URLs plus licence
 * metadata. SONIQ still filters to hosts that serve MP3 downloads.
 */

const API_HOST = 'https://api.openverse.org/v1/audio/'

export function buildSearchUrl(query, limit = 12) {
  const params = [
    `q=${encodeURIComponent(String(query || '').trim())}`,
    `page_size=${limit}`,
    'license_type=all',
  ]
  return `${API_HOST}?${params.join('&')}`
}

export function parseOpenverse(json) {
  const results = json && Array.isArray(json.results) ? json.results : []
  return results
    .map((item) => {
      if (!item || !item.url) return null
      const ms = Number(item.duration) || 0
      return {
        id: makeTrackId('ov', item.id || item.url),
        title: clean(item.title) || 'Unknown track',
        artist: clean(item.creator) || 'Openverse',
        album: clean(item.audio_set && item.audio_set.title) || '',
        duration: Math.round(ms / 1000),
        provider: PROVIDER.OPENVERSE,
        audioUrl: String(item.url),
        artworkUrl: String(item.thumbnail || ''),
        license: String(item.license_url || ''),
        size: Math.max(0, Number(item.filesize) || 0),
      }
    })
    .filter(Boolean)
}

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
