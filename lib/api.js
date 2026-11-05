import { friendlyError } from './errors'

/**
 * Device <-> phone bridge. All network traffic happens in the phone-side
 * service; the watch only sends compact JSON requests over Bluetooth.
 * `requestFn` is the zml request provided by BasePage / BaseApp.
 */

export function createBridge(requestFn) {
  async function call(method, params = {}, timeout = 20000) {
    if (typeof requestFn !== 'function') {
      throw new Error('Phone bridge is unavailable.')
    }
    try {
      const result = await requestFn({ method, params }, { timeout })
      if (result && typeof result === 'object' && result.ok === false) {
        throw new Error(result.error || result.message || 'Request failed')
      }
      return result
    } catch (error) {
      throw new Error(friendlyError(error))
    }
  }

  return {
    raw: call,

    // Spotify (official Web API via the phone)
    spotifyStatus: () => call('spotify.status', {}, 15000),
    spotifyPlayback: () => call('spotify.playback', {}, 15000),
    spotifyPlaylists: (offset = 0, limit = 12) =>
      call('spotify.playlists', { offset, limit }, 20000),
    spotifyPlaylistTracks: (playlistId, offset = 0, limit = 20) =>
      call('spotify.playlistTracks', { playlistId, offset, limit }, 20000),
    spotifySearch: (query) => call('spotify.search', { query }, 20000),
    spotifyLike: (trackId, liked) => call('spotify.like', { trackId, liked }, 15000),
    spotifySaved: (ids) => call('spotify.saved', { ids: ids || [] }, 15000),
    spotifyDevices: () => call('spotify.devices', {}, 15000),
    spotifyTransfer: (deviceId) => call('spotify.transfer', { deviceId }, 15000),
    spotifyControl: (action, extra = {}) =>
      call('spotify.control', { action, ...extra }, 15000),
    spotifyLogout: () => call('spotify.logout', {}, 10000),

    // Authorised download catalogue (Internet Archive / Jamendo)
    musicSearch: (query, provider) => call('music.search', { query, provider }, 25000),
    musicResolve: (track) => call('music.resolve', { track }, 20000),
    downloadStart: (track, expectedBytes) =>
      call('download.start', { track, expectedBytes }, 20000),
    downloadCancel: (trackId) => call('download.cancel', { trackId }, 10000),
    artworkFetch: (trackId, url) => call('artwork.fetch', { trackId, url }, 20000),
  }
}
