import { safeJsonParse } from '../shared/validate'
import {
  isPremiumProfile,
  mapDevices,
  mapPlayback,
  mapPlaylistTracks,
  mapPlaylists,
  mapSearch,
} from '../shared/spotify'
import { KEYS, fail } from './keys'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com'

/** Scopes the watch UI needs. A token issued without them returns 403. */
const REQUIRED_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-modify',
]

/**
 * Official Spotify Web API client. Runs in the phone-side service where fetch
 * is available. Tokens come from the settings page OAuth (PKCE), so no client
 * secret is stored or shipped in the app.
 */
export function createSpotify(ctx) {
  const settings = ctx.settings

  function parseBody(response) {
    const body = response && response.body
    if (typeof body === 'string') return safeJsonParse(body, null)
    return body || null
  }

  function readState() {
    return {
      clientId: settings.getItem(KEYS.clientId) || '',
      clientSecret: settings.getItem(KEYS.clientSecret) || '',
      refreshToken: settings.getItem(KEYS.refreshToken) || '',
      accessToken: settings.getItem(KEYS.accessToken) || '',
      expiry: Number(settings.getItem(KEYS.expiry)) || 0,
      user: settings.getItem(KEYS.user) || '',
      premium: settings.getItem(KEYS.premium) || '',
      country: settings.getItem(KEYS.country) || '',
      scopes: settings.getItem(KEYS.scopes) || '',
    }
  }

  function clearTokens() {
    settings.setItem(KEYS.accessToken, '')
    settings.setItem(KEYS.expiry, 0)
  }

  function clearAll() {
    clearTokens()
    settings.setItem(KEYS.refreshToken, '')
    settings.setItem(KEYS.user, '')
    settings.setItem(KEYS.premium, '')
    settings.setItem(KEYS.country, '')
    settings.setItem(KEYS.scopes, '')
  }

  async function refreshAccessToken() {
    const state = readState()
    if (!state.clientId) throw fail('spotify_not_configured', 'missing client id')
    if (!state.clientSecret) throw fail('spotify_secret_missing', 'missing client secret')
    if (!state.refreshToken) throw fail('not_authenticated', 'missing refresh token')

    const response = await ctx.fetch({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'grant_type=refresh_token' +
        `&refresh_token=${encodeURIComponent(state.refreshToken)}` +
        `&client_id=${encodeURIComponent(state.clientId)}` +
        `&client_secret=${encodeURIComponent(state.clientSecret)}`,
      timeout: 15000,
    })

    const body = parseBody(response) || {}
    if (!response || response.status >= 300 || !body.access_token) {
      const code = body.error || 'auth_expired'
      clearTokens()
      if (code === 'invalid_grant' || code === 'invalid_client') {
        settings.setItem(KEYS.refreshToken, '')
        throw fail('not_authenticated', 'Spotify session expired')
      }
      throw fail('auth_expired', code)
    }

    const expiry = Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 - 90000
    settings.setItem(KEYS.accessToken, body.access_token)
    settings.setItem(KEYS.expiry, expiry)
    if (body.refresh_token) settings.setItem(KEYS.refreshToken, body.refresh_token)
    if (body.scope) settings.setItem(KEYS.scopes, body.scope)
    return body.access_token
  }

  async function getToken(force) {
    const state = readState()
    if (!state.clientId) throw fail('spotify_not_configured', 'missing client id')
    if (!state.clientSecret) throw fail('spotify_secret_missing', 'missing client secret')
    if (!state.refreshToken) throw fail('not_authenticated', 'not signed in')
    if (!force && state.accessToken && state.expiry > Date.now() + 5000) {
      return state.accessToken
    }
    return refreshAccessToken()
  }

  async function request(path, options = {}) {
    const method = options.method || 'GET'
    const hasBody = options.body !== undefined
    let token = await getToken(false)

    const send = (accessToken) =>
      ctx.fetch({
        url: `${API_BASE}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
        timeout: options.timeout || 15000,
      })

    let response = await send(token)
    if (response && response.status === 401) {
      token = await getToken(true)
      response = await send(token)
    }

    if (!response) throw fail('no_network', 'empty response')

    if (response.status === 204 || response.status === 202) return null

    const body = parseBody(response)

    if (response.status === 429) {
      throw fail('rate_limited', 'try again shortly')
    }
    if (response.status === 404 && body && body.error && body.error.reason === 'NO_ACTIVE_DEVICE') {
      throw fail('spotify_no_device', 'no active Spotify device')
    }
    if (response.status === 403) {
      const reason = body && body.error && body.error.reason
      const message = (body && body.error && body.error.message) || 'forbidden'
      if (reason === 'PREMIUM_REQUIRED' || /premium/i.test(message)) {
        throw fail('premium_required', 'premium account required')
      }
      if (reason === 'INSUFFICIENT_CLIENT_SCOPE' || /scope|permission/i.test(message)) {
        throw fail('spotify_scope', message)
      }
      throw fail('spotify_forbidden', message)
    }
    if (response.status >= 400) {
      const code = (body && body.error && (body.error.status ? 'spotify_error' : body.error)) || 'spotify_error'
      const message = (body && body.error && body.error.message) || `HTTP ${response.status}`
      if (code === 'invalid_grant') {
        clearTokens()
        throw fail('not_authenticated', 'Spotify session expired')
      }
      throw fail(String(code), message)
    }

    return body
  }

  /**
   * Spotify refuses playback commands without an active Connect device. Pick
   * the current one, else the phone, else the first unrestricted device, so a
   * tap on the watch starts audio instead of silently killing the phone player.
   */
  async function pickPlaybackDevice(preferredId) {
    try {
      const current = await request('/v1/me/player')
      if (current && current.device && current.device.id && !current.device.is_restricted) {
        return current.device
      }
    } catch (error) {
      if (
        error &&
        (error.code === 'not_authenticated' ||
          error.code === 'spotify_scope' ||
          error.code === 'premium_required' ||
          error.code === 'spotify_forbidden')
      ) {
        throw error
      }
      // A 204/404 here just means nothing is playing; fall through to the list.
    }

    let devices = []
    try {
      const body = await request('/v1/me/player/devices')
      devices = ((body && body.devices) || []).filter((device) => device && device.id && !device.is_restricted)
    } catch (error) {
      if (
        error &&
        (error.code === 'not_authenticated' ||
          error.code === 'spotify_scope' ||
          error.code === 'premium_required' ||
          error.code === 'spotify_forbidden')
      ) {
        throw error
      }
      devices = []
    }
    if (!devices.length) return null

    return (
      devices.find((device) => device.id === preferredId) ||
      devices.find((device) => /smartphone|phone|tablet/i.test(String(device.type || ''))) ||
      devices.find((device) => device.is_active) ||
      devices[0]
    )
  }

  async function playTrack(params) {
    let body
    if (params.uri && params.contextUri) {
      body = { context_uri: params.contextUri, offset: { uri: params.uri } }
    } else if (params.uri) {
      body = { uris: [params.uri] }
    } else if (params.contextUri) {
      body = { context_uri: params.contextUri }
    } else {
      body = {}
    }

    const preferred = params.deviceId || settings.getItem('spotify_last_device') || ''
    const device = await pickPlaybackDevice(preferred)
    if (!device) {
      throw fail('spotify_no_device', 'open Spotify on the phone first')
    }

    await request(`/v1/me/player/play?device_id=${encodeURIComponent(device.id)}`, {
      method: 'PUT',
      body,
    })
    settings.setItem('spotify_last_device', device.id)
    return { ok: true, deviceId: device.id, deviceName: device.name || '' }
  }

  async function meProfile() {
    const body = await request('/v1/me')
    if (!body) throw fail('spotify_error', 'empty profile')
    settings.setItem(KEYS.user, body.display_name || '')
    settings.setItem(KEYS.premium, body.product || '')
    settings.setItem(KEYS.country, body.country || '')
    return {
      user: body.display_name || '',
      premium: isPremiumProfile(body),
      country: body.country || '',
    }
  }

  return {
    parseBody,

    async status() {
      const state = readState()
      let granted = state.scopes.split(/\s+/).filter(Boolean)
      const result = {
        configured: Boolean(state.clientId && state.clientSecret),
        authenticated: Boolean(state.clientId && state.clientSecret && state.refreshToken),
        premium: state.premium !== 'free',
        user: state.user,
        country: state.country,
        scopes: granted,
        needsReauth: false,
      }
      // The settings page may have stored a token from before scopes were
      // requested. Refresh once to learn exactly what Spotify granted.
      if (result.authenticated && !granted.length) {
        try {
          await refreshAccessToken()
          granted = readState().scopes.split(/\s+/).filter(Boolean)
          result.scopes = granted
        } catch (error) {
          // Keep status usable; the next action will surface auth errors.
        }
      }
      const missing = granted.length
        ? REQUIRED_SCOPES.filter((scope) => granted.indexOf(scope) === -1)
        : []
      result.needsReauth = missing.length > 0
      // The settings page stores the profile after sign-in, but that fetch can
      // fail (offline webview). Fill it in once from the phone service instead.
      if (result.authenticated && !state.premium) {
        try {
          const profile = await meProfile()
          result.premium = profile.premium
          result.user = profile.user
          result.country = profile.country
        } catch (error) {
          // Keep the status usable; playback calls will surface auth errors.
        }
      }
      return result
    },

    me() {
      return meProfile()
    },

    async playback() {
      const body = await request('/v1/me/player?additional_types=track')
      if (!body) return { isPlaying: false, progressMs: 0, track: null, device: null, available: false }
      return mapPlayback(body)
    },

    async playlists(params) {
      const offset = Math.max(0, Number(params.offset) || 0)
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 12))
      const body = await request(`/v1/me/playlists?offset=${offset}&limit=${limit}`)
      return mapPlaylists(body)
    },

    async playlistTracks(params) {
      const id = String(params.playlistId || '')
      if (!id) throw fail('spotify_error', 'missing playlist id')
      const offset = Math.max(0, Number(params.offset) || 0)
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 20))
      try {
        const body = await request(
          `/v1/playlists/${encodeURIComponent(id)}/items?offset=${offset}&limit=${limit}&additional_types=track`,
        )
        return mapPlaylistTracks(body)
      } catch (error) {
        if (error && error.code === 'spotify_forbidden') {
          // Since February 2026 Spotify only returns items for playlists the
          // signed-in user owns or collaborates on.
          throw fail('spotify_playlist', 'only your own playlists can be opened')
        }
        throw error
      }
    },

    async search(params) {
      const query = String(params.query || '').trim()
      if (!query) return { tracks: [], artists: [], albums: [] }
      const body = await request(
        `/v1/search?q=${encodeURIComponent(query)}&type=track,artist,album&limit=8`,
      )
      return mapSearch(body)
    },

    async saved(params) {
      const ids = Array.isArray(params.ids) ? params.ids.slice(0, 50) : []
      if (!ids.length) return { contains: [] }
      const uris = ids.map((id) => encodeURIComponent(`spotify:track:${id}`)).join(',')
      const body = await request(`/v1/me/library/contains?uris=${uris}`)
      return { contains: Array.isArray(body) ? body : [] }
    },

    async like(params) {
      const trackId = String(params.trackId || '')
      if (!trackId) throw fail('spotify_error', 'missing track id')
      const liked = Boolean(params.liked)
      await request('/v1/me/library', {
        method: liked ? 'PUT' : 'DELETE',
        body: { uris: [`spotify:track:${trackId}`] },
      })
      return { liked }
    },

    async devices() {
      const body = await request('/v1/me/player/devices')
      return { items: mapDevices(body) }
    },

    async transfer(params) {
      const deviceId = String(params.deviceId || '')
      if (!deviceId) throw fail('spotify_error', 'missing device id')
      await request('/v1/me/player', {
        method: 'PUT',
        body: { device_ids: [deviceId], play: true },
      })
      settings.setItem('spotify_last_device', deviceId)
      return { ok: true }
    },

    async control(params) {
      const action = String(params.action || '')
      switch (action) {
        case 'play':
          return playTrack(params)
        case 'pause':
          await request('/v1/me/player/pause', { method: 'PUT' })
          return { ok: true }
        case 'next':
          await request('/v1/me/player/next', { method: 'POST' })
          return { ok: true }
        case 'previous':
          await request('/v1/me/player/previous', { method: 'POST' })
          return { ok: true }
        case 'seek': {
          const ms = Math.max(0, Math.round(Number(params.positionMs) || 0))
          await request(`/v1/me/player/seek?position_ms=${ms}`, { method: 'PUT' })
          return { ok: true }
        }
        default:
          throw fail('spotify_error', 'unknown control action')
      }
    },

    logout() {
      clearAll()
      return { ok: true }
    },

    resetCache() {
        clearTokens()
    },
  }
}
