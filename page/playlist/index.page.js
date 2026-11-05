import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, deleteWidget, widget, align } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { formatBytes, formatTime, truncate } from '../../shared/format'
import { createBridge } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { removeDownloaded, sorted, stats } from '../../lib/library'
import { background, emptyState, header, navTo } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F, M } from '../../lib/theme'
import { primaryButton, set, setText, text } from '../../lib/ui-kit'

Page(
  BasePage({
    name: 'soniq.playlist',

    onInit(params) {
      this.params = parseParams(params)
      this.kind = this.params.kind === 'spotify' ? 'spotify' : 'downloaded'
      this.playlistId = this.params.id || ''
      this.name = this.params.name || (this.kind === 'downloaded' ? 'Downloaded' : 'Playlist')
      this.tracks = []
      this.offset = 0
    },

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.unsubscribers = []
      this.listRef = null
      this.emptyWidgets = []

      background(null)
      this.headerRefs = header(null, {
        title: truncate(this.name, 22),
        subtitle: this.kind === 'downloaded' ? 'On this watch \u2022 not synced' : 'Spotify playlist',
        actionIcon: this.kind === 'spotify' ? 'icon/refresh.png' : undefined,
        onAction: () => this.reload(),
      })

      this.listY = 92
      this.listH = 334
      this.statusRef = text(null, {
        x: M.pad,
        y: 180,
        w: M.contentW,
        h: 44,
        text: '',
        text_size: F.sm,
        color: C.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })

      if (this.kind === 'downloaded') {
        this.loadDownloaded()
      } else {
        this.loadSpotify()
      }

      this.subscribe()
    },

    onDestroy() {
      this.unsubscribers.forEach((off) => off())
      this.unsubscribers = []
      if (this.listRef) {
        try {
          deleteWidget(this.listRef)
        } catch (error) {
          // ignore
        }
        this.listRef = null
      }
    },

    subscribe() {
      const state = this.store
      const on = (event, handler) => {
        state.bus.on(event, handler)
        this.unsubscribers.push(() => state.bus.off(event, handler))
      }
      on('library', () => {
        if (this.kind === 'downloaded') this.loadDownloaded()
      })
      on('artwork', () => {
        if (this.kind === 'downloaded') this.loadDownloaded()
      })
    },

    loadDownloaded() {
      const items = sorted(this.store)
      this.tracks = items
      const info = stats(this.store)
      setText(
        this.headerRefs.subtitle,
        `${info.count} ${info.count === 1 ? 'track' : 'tracks'} \u2022 ${formatBytes(info.bytes)}`,
      )
      if (!items.length) {
        this.renderEmpty()
        return
      }
      this.renderList(
        items.map((item) => ({
          title: truncate(item.title, 26),
          subtitle: truncate(item.artist, 32),
          art: item.artworkPath || 'artwork/placeholder.png',
          action: 'icon/trash.png',
        })),
      )
    },

    async loadSpotify() {
      this.showStatus('Loading tracks\u2026')
      try {
        const result = await this.bridge.spotifyPlaylistTracks(this.playlistId, 0, 20)
        this.tracks = (result && result.tracks) || []
        this.total = (result && result.total) || this.tracks.length
        setText(this.headerRefs.subtitle, `Spotify \u2022 ${this.total} tracks`)
        if (!this.tracks.length) {
          this.showStatus('This playlist is empty.')
          return
        }
        this.renderList(
          this.tracks.map((track) => ({
            title: truncate(track.title, 26),
            subtitle: truncate(`${track.artist}${track.duration ? ` \u2022 ${formatTime(track.duration)}` : ''}`, 34),
            art: 'artwork/placeholder.png',
            action: 'icon/play.png',
          })),
        )
      } catch (error) {
        this.showStatus(friendlyError(error, 'Could not load playlist.'))
      }
    },

    reload() {
      if (this.kind === 'downloaded') this.loadDownloaded()
      else this.loadSpotify()
    },

    renderList(rows) {
      if (this.listRef) {
        try {
          deleteWidget(this.listRef)
        } catch (error) {
          // ignore
        }
      }
      setText(this.statusRef, '')
      this.clearEmpty()
      this.listRef = createWidget(widget.SCROLL_LIST, {
        x: M.pad,
        y: this.listY,
        w: M.contentW,
        h: this.listH,
        item_space: 6,
        item_config: [
          {
            type_id: 1,
            item_height: 66,
            item_bg_color: C.surface,
            item_bg_radius: 14,
            text_view: [
              { x: 68, y: 8, w: 220, h: 22, key: 'title', color: C.text, text_size: F.sm },
              { x: 68, y: 32, w: 220, h: 18, key: 'subtitle', color: C.textDim, text_size: F.xxs },
            ],
            text_view_count: 2,
            image_view: [
              { x: 10, y: 10, w: 46, h: 46, key: 'art' },
              { x: 298, y: 20, w: 26, h: 26, key: 'action', action: true },
            ],
            image_view_count: 2,
          },
        ],
        item_config_count: 1,
        data_array: rows,
        data_count: rows.length,
        item_click_func: (list, index, key) => this.onRow(index, key),
      })
    },

    clearEmpty() {
      if (!this.emptyWidgets) return
      this.emptyWidgets.forEach((widgetRef) => {
        try {
          deleteWidget(widgetRef)
        } catch (error) {
          // ignore
        }
      })
      this.emptyWidgets = []
    },

    renderEmpty() {
      if (this.listRef) {
        try {
          deleteWidget(this.listRef)
        } catch (error) {
          // ignore
        }
        this.listRef = null
      }
      setText(this.statusRef, '')
      if (this.emptyWidgets && this.emptyWidgets.length) return
      const refs = emptyState(null, {
        y: 150,
        icon: 'icon/downloaded.png',
        title: 'No downloads yet',
        message: 'Search for licensed music and save it to the watch for offline playback.',
      })
      const action = primaryButton(null, {
        x: 60,
        y: 340,
        w: 270,
        h: 46,
        text: 'Find music',
        onClick: () => navTo('page/search/index.page'),
      })
      this.emptyWidgets = [refs.icon, refs.title, refs.message, action.bgWidget, action.labelWidget]
    },

    onRow(index, key) {
      const track = this.tracks[index]
      if (!track) return

      if (this.kind === 'downloaded') {
        if (key === 'action') {
          removeDownloaded(this.store, track.id)
          showToast({ content: `Deleted ${truncate(track.title, 18)}` })
          this.loadDownloaded()
          return
        }
        const items = sorted(this.store)
        const itemIndex = items.findIndex((item) => item.id === track.id)
        this.store.player.setQueue(items, itemIndex < 0 ? 0 : itemIndex, { autoplay: true })
        navTo('page/home/index.page')
        return
      }

      this.playSpotify(track)
    },

    async playSpotify(track) {
      const state = this.store
      if (!state.spotify.authenticated) {
        showToast({ content: 'Connect Spotify in the Zepp app first.' })
        return
      }
      if (!state.spotify.premium) {
        showToast({ content: 'Spotify playback needs Premium.' })
        return
      }
      try {
        await this.bridge.spotifyControl('play', {
          contextUri: `spotify:playlist:${this.playlistId}`,
          uri: track.spotifyUri,
        })
        state.current = { ...track, source: 'spotify' }
        state.playback.source = 'spotify'
        state.playback.isPlaying = true
        state.playback.duration = track.duration || 0
        state.playback.position = 0
        showToast({ content: `Playing ${truncate(track.title, 18)}` })
      } catch (error) {
        showToast({ content: friendlyError(error) })
      }
    },

    showStatus(message) {
      if (this.listRef) {
        try {
          deleteWidget(this.listRef)
        } catch (error) {
          // ignore
        }
        this.listRef = null
      }
      this.clearEmpty()
      setText(this.statusRef, message)
      set(this.statusRef, { color: C.textDim })
    },
  }),
)

function parseParams(params) {
  if (!params) return {}
  if (typeof params === 'object') return params
  try {
    return JSON.parse(params)
  } catch (error) {
    const out = {}
    String(params)
      .split('&')
      .forEach((pair) => {
        const [key, value] = pair.split('=')
        if (key) out[key] = decodeURIComponent(value || '')
      })
    return out
  }
}
