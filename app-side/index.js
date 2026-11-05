import { BaseSideService } from '@zeppos/zml/base-side'
import { KEYS } from './keys'
import { createSpotify } from './spotify'
import { createCatalog } from './catalog'
import { createDownloads } from './downloads'

/**
 * Phone-side service: all HTTP traffic (Spotify Web API, authorised music
 * catalogues, audio/artwork downloads) happens here, because Zepp OS device
 * apps have no network APIs. Files are pushed to the watch with transferFile.
 */
AppSideService(
  BaseSideService({
    onInit() {
      this.spotify = createSpotify(this)
      this.catalog = createCatalog(this)
      this.downloader = createDownloads(this)
      this.log('SONIQ side service ready')
    },

    onRun() {
      this.log('SONIQ side service running')
    },

    onSettingsChange({ key, newValue }) {
      if (!key) return
      if (key === KEYS.refreshToken && !newValue) this.spotify.resetCache()
      if (key === KEYS.clientId) this.spotify.resetCache()
      this.log('settings changed', key, newValue ? 'set' : 'cleared')
    },

    async handleRequest(req) {
      const method = req && req.method
      const params = (req && req.params) || {}

      switch (method) {
        case 'spotify.status':
          return this.spotify.status()
        case 'spotify.me':
          return this.spotify.me()
        case 'spotify.playback':
          return this.spotify.playback()
        case 'spotify.playlists':
          return this.spotify.playlists(params)
        case 'spotify.playlistTracks':
          return this.spotify.playlistTracks(params)
        case 'spotify.search':
          return this.spotify.search(params)
        case 'spotify.saved':
          return this.spotify.saved(params)
        case 'spotify.like':
          return this.spotify.like(params)
        case 'spotify.devices':
          return this.spotify.devices()
        case 'spotify.transfer':
          return this.spotify.transfer(params)
        case 'spotify.control':
          return this.spotify.control(params)
        case 'spotify.logout':
          return this.spotify.logout()

        case 'music.search':
          return this.catalog.search(params)
        case 'music.resolve':
          return this.catalog.resolve(params)

        case 'download.start':
          return this.downloader.start(params.track || {})
        case 'download.cancel':
          return this.downloader.cancel(String(params.trackId || ''))
        case 'artwork.fetch':
          return this.downloader.artwork(String(params.trackId || ''), String(params.url || ''))

        default: {
          const error = new Error(`unknown_method: ${method}`)
          error.code = 'unknown_method'
          throw error
        }
      }
    },

    onRequest(req, res) {
      this.handleRequest(req)
        .then((data) => res(null, data))
        .catch((error) => {
          this.error('request failed', req && req.method, error && (error.message || error))
          res(error instanceof Error ? error : new Error(String(error)))
        })
    },
  }),
)
