import { PROVIDER } from './constants.js'

/**
 * Mapping helpers for the official Spotify Web API. The phone-side service
 * performs the HTTP calls; these pure functions normalise the payloads for the
 * watch and are unit tested.
 */

export function pickImage(images, target = 300) {
  if (!Array.isArray(images) || !images.length) return ''
  const usable = images.filter((image) => image && image.url)
  if (!usable.length) return ''
  const sorted = usable
    .slice()
    .sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0))
  // Smallest image that is at least the requested size, else the largest.
  const smallestLargeEnough = sorted.find((image) => (Number(image.width) || 0) >= target)
  return (smallestLargeEnough || sorted[sorted.length - 1]).url
}

export function mapSpotifyTrack(item) {
  if (!item || item.type === 'episode' || !item.id) return null
  const artists = Array.isArray(item.artists) ? item.artists.map((a) => a && a.name).filter(Boolean) : []
  const images = item.album && Array.isArray(item.album.images) ? item.album.images : []
  return {
    id: `sp-${item.id}`,
    title: item.name || 'Unknown track',
    artist: artists.join(', ') || 'Unknown artist',
    album: (item.album && item.album.name) || '',
    duration: Math.round((Number(item.duration_ms) || 0) / 1000),
    provider: PROVIDER.SPOTIFY,
    source: 'spotify',
    spotifyUri: item.uri || `spotify:track:${item.id}`,
    artworkUrl: pickImage(images, 300),
    audioUrl: '',
    license: '',
    size: 0,
  }
}

export function mapSpotifyArtist(item) {
  if (!item || !item.id) return null
  return {
    id: `spa-${item.id}`,
    title: item.name || 'Unknown artist',
    subtitle: Array.isArray(item.genres) && item.genres.length ? item.genres.slice(0, 2).join(', ') : 'Artist',
    artworkUrl: pickImage(item.images, 160),
    spotifyUri: item.uri || `spotify:artist:${item.id}`,
    kind: 'artist',
  }
}

export function mapSpotifyAlbum(item) {
  if (!item || !item.id) return null
  return {
    id: `spal-${item.id}`,
    title: item.name || 'Unknown album',
    subtitle: Array.isArray(item.artists) ? item.artists.map((a) => a && a.name).filter(Boolean).join(', ') : 'Album',
    artworkUrl: pickImage(item.images, 160),
    spotifyUri: item.uri || `spotify:album:${item.id}`,
    kind: 'album',
  }
}

export function mapSearch(json) {
  const body = json || {}
  const tracks = ((body.tracks && body.tracks.items) || []).map(mapSpotifyTrack).filter(Boolean)
  const artists = ((body.artists && body.artists.items) || []).map(mapSpotifyArtist).filter(Boolean)
  const albums = ((body.albums && body.albums.items) || []).map(mapSpotifyAlbum).filter(Boolean)
  return { tracks, artists, albums }
}

export function mapPlaylist(item) {
  if (!item || !item.id) return null
  return {
    id: item.id,
    name: item.name || 'Playlist',
    trackCount: (item.tracks && Number(item.tracks.total)) || 0,
    artworkUrl: pickImage((item.images || []).slice().reverse(), 120),
    spotifyUri: item.uri || `spotify:playlist:${item.id}`,
    owner: (item.owner && item.owner.display_name) || '',
  }
}

export function mapPlaylists(json) {
  const items = (json && json.items) || []
  return {
    items: items.map(mapPlaylist).filter(Boolean),
    total: Number(json && json.total) || items.length,
  }
}

export function mapPlaylistTracks(json) {
  const items = (json && json.items) || []
  const tracks = items
    .map((entry) => (entry && entry.track ? mapSpotifyTrack(entry.track) : null))
    .filter(Boolean)
  return {
    tracks,
    total: Number(json && json.total) || tracks.length,
    next: (json && json.next) || '',
  }
}

export function mapDevice(device) {
  if (!device || !device.id) return null
  return {
    id: device.id,
    name: device.name || 'Spotify device',
    type: device.type || '',
    isActive: Boolean(device.is_active),
    volume: Number(device.volume_percent) || 0,
    restricted: Boolean(device.is_restricted),
  }
}

export function mapDevices(json) {
  return ((json && json.devices) || []).map(mapDevice).filter(Boolean)
}

export function mapPlayback(json) {
  const body = json || {}
  const item = body.item && body.item.type === 'track' ? mapSpotifyTrack(body.item) : null
  const device = body.device ? mapDevice(body.device) : null
  return {
    isPlaying: Boolean(body.is_playing),
    progressMs: Number(body.progress_ms) || 0,
    track: item,
    device,
    shuffle: Boolean(body.shuffle_state),
    repeat: body.repeat_state || 'off',
    available: Boolean(body.device || body.item),
  }
}

export function isPremiumProfile(json) {
  return Boolean(json && json.product === 'premium')
}

export function looksLikeSavedTracks(json) {
  return Boolean(json && Array.isArray(json.items))
}

export function savedTrackIds(json) {
  const items = (json && json.items) || []
  return items.map((entry) => entry && entry.track && entry.track.id).filter(Boolean)
}
