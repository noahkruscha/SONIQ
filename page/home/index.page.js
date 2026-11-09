import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, setStatusBarVisible } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { SPOTIFY_POLL_MS } from '../../shared/constants'
import { formatBytes, formatTime, percent, truncate } from '../../shared/format'
import { isDownloadable } from '../../shared/tracks'
import { createBridge } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { hasTrack, isLiked, stats, toggleLocalLike } from '../../lib/library'
import { navTo, destroy } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F, M } from '../../lib/theme'
import {
  circle,
  iconButton,
  image,
  rect,
  setSrc,
  setText,
  setVisible,
  text,
} from '../../lib/ui-kit'

const BAR_W = 318
const MAX_PLAYLISTS = 6

Page(
  BasePage({
    name: 'soniq.home',

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.refs = {}
      this.renderedPlaylists = -1
      this.spotifyTimer = null
      this.tickTimer = null
      this.localTick = null

      try {
        setStatusBarVisible(false)
      } catch (error) {
        // Only available on square screens.
      }

      if (!this.store) {
        text(null, {
          x: 20,
          y: 200,
          w: M.width - 40,
          h: 40,
          text: 'SONIQ could not start. Reopen the app.',
          text_size: F.sm,
          color: C.textDim,
          align_h: align.CENTER_H,
        })
        return
      }

      this.buildContent()
      this.bindEvents()
      this.refreshAll()
      this.startLocalTick()
      this.loadSpotify()
    },

    onDestroy() {
      if (this.unsubscribers) {
        this.unsubscribers.forEach((off) => off())
        this.unsubscribers = []
      }
      if (this.spotifyTimer) clearInterval(this.spotifyTimer)
      if (this.tickTimer) clearInterval(this.tickTimer)
      if (this.localTick) clearInterval(this.localTick)
      this.spotifyTimer = null
      this.tickTimer = null
      this.localTick = null
      if (this.container) {
        try {
          this.store.ui.homeScroll = readScroll(this.container)
        } catch (error) {
          // ignore
        }
      }
    },

    /* ------------------------------------------------------------------ */
    /* Layout                                                              */
    /* ------------------------------------------------------------------ */

    buildContent(preserveScroll = false) {
      const state = this.store
      const scroll = preserveScroll ? readScroll(this.container) : 0
      if (this.container) destroy(this.container)
      this.refs = {}

      const c = createWidget(widget.VIEW_CONTAINER, {
        x: 0,
        y: 0,
        w: M.width,
        h: M.height,
        scroll_enable: 1,
        bounce: 1,
      })
      this.container = c

      rect(c, { x: 0, y: 0, w: M.width, h: 1600, color: C.bg })

      // Header -----------------------------------------------------------
      text(c, { x: 24, y: 10, w: 170, h: 36, text: 'SONIQ', text_size: 28, color: C.text })
      this.refs.pillBox = rect(c, { x: 264, y: 12, w: 102, h: 30, color: C.surfaceAlt, radius: 15 })
      this.refs.pillText = text(c, {
        x: 264,
        y: 12,
        w: 102,
        h: 30,
        text: 'OFFLINE',
        text_size: F.xxs,
        color: C.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })

      // Player -----------------------------------------------------------
      rect(c, { x: 100, y: 54, w: 190, h: 190, color: 0x101012, radius: 22 })
      this.refs.artwork = image(c, {
        x: 104,
        y: 58,
        w: 182,
        h: 182,
        src: 'artwork/placeholder.png',
      })

      this.refs.title = text(c, {
        x: 24,
        y: 250,
        w: 342,
        h: 34,
        text: 'Nothing playing',
        text_size: 24,
        color: C.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
      this.refs.artist = text(c, {
        x: 24,
        y: 286,
        w: 342,
        h: 24,
        text: 'Open Downloaded to start listening',
        text_size: 18,
        color: C.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })

      rect(c, { x: 36, y: 320, w: BAR_W, h: 6, color: C.track, radius: 3 })
      this.refs.progressFill = rect(c, {
        x: 36,
        y: 320,
        w: 1,
        h: 6,
        color: C.green,
        radius: 3,
      })
      this.refs.elapsed = text(c, {
        x: 36,
        y: 328,
        w: 90,
        h: 20,
        text: '0:00',
        text_size: F.xxs,
        color: C.textMuted,
      })
      this.refs.duration = text(c, {
        x: 264,
        y: 328,
        w: 90,
        h: 20,
        text: '0:00',
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.RIGHT,
      })

      this.refs.like = iconButton(c, {
        x: 30,
        y: 371,
        size: 36,
        src: 'icon/heart.png',
        onClick: () => this.onLike(),
      })
      circle(c, { center_x: 108, center_y: 389, radius: 24, color: C.surfaceAlt })
      this.refs.previous = iconButton(c, {
        x: 90,
        y: 371,
        size: 36,
        src: 'icon/previous.png',
        onClick: () => this.onPrevious(),
      })
      this.refs.playCircle = circle(c, {
        center_x: 195,
        center_y: 388,
        radius: 34,
        color: C.green,
        click_func: () => this.onPlayPause(),
      })
      this.refs.playIcon = iconButton(c, {
        x: 167,
        y: 360,
        size: 56,
        src: 'icon/play.png',
        onClick: () => this.onPlayPause(),
      })
      circle(c, { center_x: 282, center_y: 389, radius: 24, color: C.surfaceAlt })
      this.refs.next = iconButton(c, {
        x: 264,
        y: 371,
        size: 36,
        src: 'icon/next.png',
        onClick: () => this.onNext(),
      })
      this.refs.download = iconButton(c, {
        x: 324,
        y: 371,
        size: 36,
        src: 'icon/download.png',
        onClick: () => this.onDownload(),
      })

      this.refs.status = text(c, {
        x: 24,
        y: 428,
        w: 342,
        h: 20,
        text: '',
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.CENTER_H,
      })

      rect(c, { x: 24, y: 456, w: 342, h: 1, color: C.border })

      // Browse -----------------------------------------------------------
      text(c, { x: 24, y: 470, w: 200, h: 18, text: 'LISTEN', text_size: F.xxs, color: C.textMuted })

      rect(c, {
        x: 24,
        y: 504,
        w: 342,
        h: 76,
        color: C.surface,
        radius: 16,
        click_func: () => navTo('page/search/index.page'),
      })
      image(c, { x: 42, y: 527, w: 30, h: 30, src: 'icon/search.png' })
      text(c, { x: 86, y: 514, w: 220, h: 28, text: 'Search music', text_size: F.sm, color: C.text })
      text(c, {
        x: 86,
        y: 544,
        w: 230,
        h: 20,
        text: 'Songs, artists, albums',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(c, { x: 330, y: 528, w: 22, h: 22, src: 'icon/chevron.png' })

      rect(c, {
        x: 24,
        y: 590,
        w: 342,
        h: 76,
        color: C.surface,
        radius: 16,
        click_func: () => navTo('page/output/index.page'),
      })
      image(c, { x: 42, y: 613, w: 30, h: 30, src: 'icon/speaker.png' })
      text(c, { x: 86, y: 600, w: 220, h: 28, text: 'Audio output', text_size: F.sm, color: C.text })
      this.refs.outputSub = text(c, {
        x: 86,
        y: 630,
        w: 230,
        h: 20,
        text: 'Watch audio \u2022 system managed',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(c, { x: 330, y: 614, w: 22, h: 22, src: 'icon/chevron.png' })

      // Library ----------------------------------------------------------
      text(c, { x: 24, y: 686, w: 220, h: 18, text: 'YOUR LIBRARY', text_size: F.xxs, color: C.textMuted })

      rect(c, {
        x: 24,
        y: 710,
        w: 342,
        h: 82,
        color: C.surface,
        radius: 16,
        click_func: () => navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' }),
      })
      image(c, { x: 40, y: 726, w: 50, h: 50, src: 'artwork/placeholder.png' })
      text(c, { x: 100, y: 718, w: 210, h: 28, text: 'Downloaded', text_size: F.sm, color: C.text })
      this.refs.downloadedSub = text(c, {
        x: 100,
        y: 748,
        w: 210,
        h: 20,
        text: '0 tracks',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(c, { x: 330, y: 734, w: 22, h: 22, src: 'icon/chevron.png' })

      // Spotify ----------------------------------------------------------
      const spotify = state.spotify
      const playlists = (spotify.playlists || []).slice(0, MAX_PLAYLISTS)
      text(c, {
        x: 24,
        y: 804,
        w: 250,
        h: 18,
        text: spotify.authenticated ? 'SPOTIFY PLAYLISTS' : 'SPOTIFY',
        text_size: F.xxs,
        color: C.textMuted,
      })

      this.refs.playlistRows = []
      if (!spotify.authenticated) {
        rect(c, {
          x: 24,
          y: 826,
          w: 342,
          h: 72,
          color: C.surface,
          radius: 16,
          click_func: () => this.showConnectHelp(),
        })
        text(c, {
          x: 42,
          y: 834,
          w: 260,
          h: 28,
          text: 'Connect Spotify',
          text_size: F.sm,
          color: C.text,
        })
        text(c, {
          x: 42,
          y: 862,
          w: 280,
          h: 20,
          text: 'Zepp app \u2192 SONIQ \u2192 Settings',
          text_size: F.xxs,
          color: C.textDim,
        })
        image(c, { x: 330, y: 848, w: 22, h: 22, src: 'icon/chevron.png' })
        this.renderedPlaylists = 0
      } else if (playlists.length === 0) {
        rect(c, { x: 24, y: 826, w: 342, h: 72, color: C.surface, radius: 16 })
        text(c, {
          x: 42,
          y: 836,
          w: 300,
          h: 26,
          text: spotify.playlistsError ? 'Could not load playlists' : 'Loading playlists\u2026',
          text_size: F.xs,
          color: spotify.playlistsError ? C.red : C.textDim,
        })
        text(c, {
          x: 42,
          y: 864,
          w: 300,
          h: 20,
          text: spotify.playlistsError || 'Keep the phone nearby',
          text_size: F.xxs,
          color: C.textMuted,
        })
        this.renderedPlaylists = 0
      } else {
        playlists.forEach((playlist, index) => {
          const y = 826 + index * 72
          rect(c, {
            x: 24,
            y,
            w: 342,
            h: 66,
            color: C.surface,
            radius: 16,
            click_func: () =>
              navTo('page/playlist/index.page', {
                kind: 'spotify',
                id: playlist.id,
                name: playlist.name,
              }),
          })
          rect(c, { x: 38, y: y + 10, w: 46, h: 46, color: 0x242426, radius: 10 })
          text(c, {
            x: 38,
            y: y + 10,
            w: 46,
            h: 46,
            text: (playlist.name || '?').slice(0, 1).toUpperCase(),
            text_size: 22,
            color: C.green,
            align_h: align.CENTER_H,
            align_v: align.CENTER_V,
          })
          text(c, {
            x: 96,
            y: y + 10,
            w: 220,
            h: 26,
            text: truncate(playlist.name, 26),
            text_size: F.xs,
            color: C.text,
          })
          text(c, {
            x: 96,
            y: y + 38,
            w: 220,
            h: 20,
            text: `${playlist.trackCount || 0} tracks`,
            text_size: F.xxs,
            color: C.textDim,
          })
          image(c, { x: 330, y: y + 22, w: 22, h: 22, src: 'icon/chevron.png' })
        })
        this.renderedPlaylists = playlists.length
      }

      const storageY = 826 + Math.max(this.renderedPlaylists, spotify.authenticated ? 0 : 1) * 72 + 12
      rect(c, {
        x: 24,
        y: storageY,
        w: 342,
        h: 68,
        color: C.surface,
        radius: 16,
        click_func: () => navTo('page/storage/index.page'),
      })
      image(c, { x: 42, y: storageY + 20, w: 28, h: 28, src: 'icon/list.png' })
      text(c, { x: 86, y: storageY + 10, w: 220, h: 28, text: 'Storage', text_size: F.sm, color: C.text })
      this.refs.storageSub = text(c, {
        x: 86,
        y: storageY + 40,
        w: 220,
        h: 20,
        text: 'Checking\u2026',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(c, { x: 330, y: storageY + 23, w: 22, h: 22, src: 'icon/chevron.png' })

      text(c, {
        x: 24,
        y: storageY + 84,
        w: 342,
        h: 20,
        text: 'SONIQ 1.0 \u2022 Offline first',
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.CENTER_H,
      })

      if (scroll) setScroll(c, scroll)
      this.renderedDownloaded = -1
      this.renderedStorageKey = ''
    },

    bindEvents() {
      const state = this.store
      const on = (event, handler) => {
        state.bus.on(event, handler)
        this.unsubscribers.push(() => state.bus.off(event, handler))
      }
      this.unsubscribers = []
      on('player', () => this.refreshPlayer())
      on('progress', () => this.refreshProgress())
      on('track', () => this.refreshPlayer())
      on('library', () => this.refreshLibrary())
      on('downloads', () => this.refreshDownload())
      on('download-progress', () => this.refreshDownload())
      on('download-done', () => this.refreshLibrary())
      on('storage', () => this.refreshStorage())
      on('likes', () => this.refreshLike())
      on('artwork', () => this.refreshArtwork())
      on('spotify', () => this.refreshSpotify())
      on('error', ({ message }) => this.showError(message))
    },

    /* ------------------------------------------------------------------ */
    /* Data                                                                */
    /* ------------------------------------------------------------------ */

    async loadSpotify() {
      const state = this.store
      try {
        const status = await this.bridge.spotifyStatus()
        state.spotify.authenticated = Boolean(status && status.authenticated)
        state.spotify.premium = Boolean(status && status.premium)
        state.spotify.user = (status && status.user) || ''
        state.spotify.country = (status && status.country) || ''
      } catch (error) {
        state.spotify.authenticated = false
      }
      this.refreshSpotify()

      if (!state.spotify.authenticated) return

      try {
        const lists = await this.bridge.spotifyPlaylists(0, MAX_PLAYLISTS)
        state.spotify.playlists = (lists && lists.items) || []
        state.spotify.playlistsLoaded = true
        state.spotify.playlistsError = ''
      } catch (error) {
        state.spotify.playlists = []
        state.spotify.playlistsLoaded = true
        state.spotify.playlistsError = friendlyError(error, 'Playlists unavailable.')
      }
      this.refreshSpotify()
      this.refreshSpotifyPlayback()
      this.spotifyTimer = setInterval(() => {
        this.refreshSpotifyPlayback()
      }, SPOTIFY_POLL_MS)
    },

    async refreshSpotifyPlayback() {
      const state = this.store
      if (!state.spotify.authenticated) return
      try {
        const playback = await this.bridge.spotifyPlayback()
        state.spotify.playback = playback
        state.spotify.lastSync = Date.now()
        if (playback && playback.isPlaying && !state.playback.isPlaying) {
          this.adoptSpotifyPlayback(playback)
          this.startTick()
        }
        this.refreshPlayer()
        this.refreshSpotify()
        this.refreshLike()
      } catch (error) {
        state.spotify.playback = null
        this.refreshSpotify()
      }
    },

    adoptSpotifyPlayback(playback) {
      if (!playback || !playback.track) return
      const state = this.store
      state.current = {
        ...playback.track,
        source: 'spotify',
        provider: 'spotify',
      }
      state.playback.source = 'spotify'
      state.playback.isPlaying = Boolean(playback.isPlaying)
      state.playback.duration = playback.track.duration || 0
      state.playback.position = (playback.progressMs || 0) / 1000
      state.playback.error = ''
      this.refreshLike()
    },

    startLocalTick() {
      if (this.localTick) return
      this.localTick = setInterval(() => {
        const state = this.store
        if (!state.playback.isPlaying || state.playback.source === 'spotify') return
        this.refreshProgress()
      }, 1000)
    },

    startTick() {
      if (this.tickTimer) return
      this.tickTimer = setInterval(() => {
        const state = this.store
        if (state.playback.source !== 'spotify') {
          clearInterval(this.tickTimer)
          this.tickTimer = null
          return
        }
        if (!state.playback.isPlaying) return
        state.playback.position += 1
        this.refreshProgress()
      }, 1000)
    },

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */

    onPlayPause() {
      const state = this.store
      const track = state.current
      if (!track) {
        showToast({ content: 'Add a track from Search, then play it.' })
        return
      }
      if (state.playback.source === 'spotify') {
        const playing = Boolean(state.spotify.playback && state.spotify.playback.isPlaying)
        this.spotifyAction(playing ? 'pause' : 'play')
        return
      }
      state.player.toggle()
    },

    onPrevious() {
      const state = this.store
      if (state.playback.source === 'spotify') {
        this.spotifyAction('previous')
        return
      }
      state.player.previous()
    },

    onNext() {
      const state = this.store
      if (state.playback.source === 'spotify') {
        this.spotifyAction('next')
        return
      }
      state.player.next()
    },

    async spotifyAction(action) {
      const state = this.store
      if (!state.spotify.authenticated) {
        showToast({ content: 'Sign in to Spotify in the Zepp app.' })
        return
      }
      if (!state.spotify.premium) {
        showToast({ content: 'Spotify playback control needs Premium.' })
        return
      }
      try {
        await this.bridge.spotifyControl(action)
        await this.refreshSpotifyPlayback()
      } catch (error) {
        showToast({ content: friendlyError(error) })
      }
    },

    async onLike() {
      const state = this.store
      const track = state.current
      if (!track) return

      if (track.provider === 'spotify') {
        const spotifyId = String(track.id).replace(/^sp-/, '')
        const liked = !state.spotify.savedIds[spotifyId]
        state.spotify.savedIds[spotifyId] = liked
        this.refreshLike()
        try {
          await this.bridge.spotifyLike(spotifyId, liked)
        } catch (error) {
          state.spotify.savedIds[spotifyId] = !liked
          this.refreshLike()
          showToast({ content: friendlyError(error, 'Could not update Spotify likes.') })
        }
        return
      }

      const liked = toggleLocalLike(state, track.id)
      this.refreshLike()
      showToast({ content: liked ? 'Added to liked' : 'Removed from liked' })
    },

    onDownload() {
      const state = this.store
      const track = state.current
      if (!track) {
        showToast({ content: 'Nothing to download yet.' })
        return
      }
      if (track.provider === 'spotify') {
        showToast({ content: 'Spotify audio cannot be saved. Searching licensed copies\u2026' })
        navTo('page/results/index.page', {
          query: `${track.title} ${track.artist}`,
          provider: 'archive',
          auto: 1,
        })
        return
      }
      if (hasTrack(state, track.id)) {
        navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' })
        return
      }
      if (!isDownloadable(track)) {
        showToast({ content: 'No downloadable audio URL for this track.' })
        return
      }
      state.downloadsMgr.start(track)
      this.refreshDownload()
    },

    showConnectHelp() {
      showToast({ content: 'Zepp app > Profile > SONIQ > Settings' })
    },

    showError(message) {
      if (!message) return
      if (this.refs.status) {
        setText(this.refs.status, message)
        this.refs.status.setProperty(prop.MORE, { color: C.red })
      }
    },

    /* ------------------------------------------------------------------ */
    /* Refresh                                                             */
    /* ------------------------------------------------------------------ */

    refreshAll() {
      this.refreshPlayer()
      this.refreshProgress()
      this.refreshLike()
      this.refreshDownload()
      this.refreshLibrary()
      this.refreshStorage()
      this.refreshSpotify()
    },

    refreshPlayer() {
      const state = this.store
      const track = state.current
      const isSpotify = state.playback.source === 'spotify'
      const playing = isSpotify
        ? Boolean(state.spotify.playback && state.spotify.playback.isPlaying)
        : state.playback.isPlaying

      if (!track) {
        setText(this.refs.title, 'Nothing playing')
        setText(this.refs.artist, 'Open Downloaded to start listening')
        setSrc(this.refs.artwork, 'artwork/placeholder.png')
        setText(this.refs.pillText, 'OFFLINE')
        this.refs.pillText.setProperty(prop.MORE, { color: C.textDim })
        setSrc(this.refs.playIcon, 'icon/play.png')
        setVisible(this.refs.download, false)
        this.refreshProgress()
        return
      }

      setText(this.refs.title, truncate(track.title, 30))
      setText(this.refs.artist, truncate(track.artist, 34))
      setSrc(this.refs.artwork, track.artworkPath || 'artwork/placeholder.png')
      setText(this.refs.pillText, isSpotify ? 'SPOTIFY' : 'ON WATCH')
      this.refs.pillText.setProperty(prop.MORE, { color: isSpotify ? C.green : C.textDim })
      setSrc(this.refs.playIcon, playing ? 'icon/pause.png' : 'icon/play.png')
      setVisible(this.refs.download, true)
      this.refreshProgress()
      this.refreshLike()
      this.refreshDownload()
      this.refreshStatus()
    },

    refreshProgress() {
      const state = this.store
      const isSpotify = state.playback.source === 'spotify'
      const duration = isSpotify
        ? (state.spotify.playback && state.spotify.playback.track
            ? state.spotify.playback.track.duration
            : state.playback.duration) || 0
        : state.playback.duration || (state.current && state.current.duration) || 0
      const position = isSpotify
        ? state.playback.position || 0
        : state.player
          ? state.player.getPosition()
          : state.playback.position || 0

      const pct = percent(position, duration)
      const width = Math.max(2, Math.round((BAR_W * pct) / 100))
      if (this.refs.progressFill) {
        this.refs.progressFill.setProperty(prop.MORE, { x: 36, y: 320, w: width, h: 6 })
      }
      setText(this.refs.elapsed, formatTime(position))
      setText(this.refs.duration, formatTime(duration))
    },

    refreshLike() {
      const state = this.store
      const track = state.current
      let liked = false
      if (track) {
        if (track.provider === 'spotify') {
          const spotifyId = String(track.id).replace(/^sp-/, '')
          liked = Boolean(state.spotify.savedIds[spotifyId])
          if (state.spotify.savedIds[spotifyId] === undefined && state.spotify.authenticated) {
            this.loadSavedState(spotifyId)
          }
        } else {
          liked = isLiked(state, track.id)
        }
      }
      setSrc(this.refs.like, liked ? 'icon/heart_filled.png' : 'icon/heart.png')
    },

    async loadSavedState(spotifyId) {
      const state = this.store
      if (!spotifyId || state.spotify.savedIds[spotifyId] !== undefined) return
      try {
        const result = await this.bridge.spotifySaved([spotifyId])
        if (result && Array.isArray(result.contains) && result.contains.length) {
          state.spotify.savedIds[spotifyId] = Boolean(result.contains[0])
          this.refreshLike()
        }
      } catch (error) {
        // Like state is cosmetic; never block playback for it.
      }
    },

    refreshDownload() {
      const state = this.store
      const track = state.current
      if (!this.refs.download) return
      if (!track) {
        setSrc(this.refs.download, 'icon/download.png')
        return
      }
      if (track.provider === 'spotify') {
        setSrc(this.refs.download, 'icon/download.png')
        this.refreshStatus()
        return
      }
      const record = state.downloadsMgr.stateFor(track)
      if (record.phase === 'done' || hasTrack(state, track.id)) {
        setSrc(this.refs.download, 'icon/downloaded.png')
      } else {
        setSrc(this.refs.download, 'icon/download.png')
      }
      this.refreshStatus()
    },

    refreshStatus() {
      const state = this.store
      const track = state.current
      if (!this.refs.status) return
      let message = ''
      let color = C.textMuted

      if (state.playback.error) {
        message = state.playback.error
        color = C.red
      } else if (track && track.source !== 'spotify') {
        const record = state.downloadsMgr.stateFor(track)
        if (record && record.phase !== 'done' && record.phase !== 'idle') {
          message = state.downloadsMgr.statusLabel(record)
          color = record.phase === 'error' ? C.red : C.green
        } else if (hasTrack(state, track.id)) {
          const item = state.library.items.find((entry) => entry.id === track.id)
          message = `On this watch \u2022 ${formatBytes((item && item.size) || 0)} \u2022 MP3`
        } else {
          message = 'Not downloaded \u2022 tap download to save'
        }
      } else if (track && track.source === 'spotify') {
        const device = state.spotify.playback && state.spotify.playback.device
        message = device ? `Playing on ${truncate(device.name, 22)}` : 'Spotify \u2022 tap play to start'
      } else {
        message = 'Offline library ready'
      }

      setText(this.refs.status, message)
      this.refs.status.setProperty(prop.MORE, { color })
    },

    refreshLibrary() {
      const state = this.store
      const info = stats(state)
      if (!this.refs.downloadedSub) return
      setText(
        this.refs.downloadedSub,
        `${info.count} ${info.count === 1 ? 'track' : 'tracks'} \u2022 ${formatBytes(info.bytes)}`,
      )
      this.refreshDownload()
    },

    refreshStorage() {
      const disk = this.store.system.disk
      if (!this.refs.storageSub || !disk) return
      setText(this.refs.storageSub, `${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`)
    },

    refreshSpotify() {
      const state = this.store
      if (this.refs.outputSub) {
        const device = state.spotify.playback && state.spotify.playback.device
        setText(
          this.refs.outputSub,
          device && state.spotify.authenticated
            ? `Spotify \u2022 ${truncate(device.name, 18)}`
            : 'Watch audio \u2022 system managed',
        )
      }
      const expected = state.spotify.authenticated
        ? Math.min((state.spotify.playlists || []).length, MAX_PLAYLISTS)
        : 0
      if (this.renderedPlaylists !== expected) {
        this.buildContent(true)
        this.refreshAll()
      }
    },

    refreshArtwork() {
      const state = this.store
      const track = state.current
      if (track && this.refs.artwork) {
        setSrc(this.refs.artwork, track.artworkPath || 'artwork/placeholder.png')
      }
    },
  }),
)

function readScroll(container) {
  if (!container) return 0
  try {
    const props = container.getProperty(prop.MORE)
    const value = props && (props.pos_y !== undefined ? props.pos_y : props.posY)
    return Number(value) || 0
  } catch (error) {
    return 0
  }
}

function setScroll(container, y) {
  if (!container) return
  try {
    container.setProperty(prop.MORE, { pos_y: y })
  } catch (error) {
    // ignore
  }
}
