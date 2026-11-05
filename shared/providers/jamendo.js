import { PROVIDER, TARGET_KBPS } from '../constants.js'
import { makeTrackId } from '../tracks.js'

/**
 * Jamendo provider (free client_id required). Every track is published under a
 * Creative Commons licence and Jamendo exposes MP3 downloads for them.
 * `audioformat=mp32` asks for the 128 kbps MP3 variant.
 */

const API_HOST = 'https://api.jamendo.com/v3.0'

export function buildSearchUrl(query, clientId, limit = 10) {
  const params = [
    `client_id=${encodeURIComponent(clientId)}`,
    'format=json',
    'limit=' + limit,
    'audioformat=mp32',
    'include=musicinfo',
    'imagesize=300',
    'search=' + encodeURIComponent(String(query || '').trim()),
  ]
  return `${API_HOST}/tracks/?${params.join('&')}`
}

export function mapJamendoTrack(item) {
  const duration = Math.max(0, Math.round(Number(item.duration) || 0))
  // Only surface files the artist explicitly allows to be downloaded.
  const downloadUrl = item.audiodownload_allowed && item.audiodownload ? item.audiodownload : ''
  return {
    id: makeTrackId('jam', `${item.id}:${item.name}`),
    title: item.name || 'Unknown track',
    artist: item.artist_name || 'Unknown artist',
    album: item.album_name || '',
    duration,
    provider: PROVIDER.JAMENDO,
    audioUrl: downloadUrl || '',
    artworkUrl: item.image || item.album_image || '',
    license: item.license_ccurl || '',
    size: duration > 0 ? Math.ceil((duration * TARGET_KBPS * 1000) / 8) : 0,
  }
}

export function parseJamendo(json) {
  const results = json && Array.isArray(json.results) ? json.results : []
  return results
    .map(mapJamendoTrack)
    .filter((track) => Boolean(track.audioUrl))
}
