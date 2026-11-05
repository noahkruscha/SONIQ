import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, deleteWidget, widget, align } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { formatTime, truncate } from '../../shared/format'
import { createBridge } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { hasTrack } from '../../lib/library'
import { background, header, navTo } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F, M } from '../../lib/theme'
import { drawProviderRow } from '../../lib/keyboard-ui'
import { set, setText, text } from '../../lib/ui-kit'

const PROVIDERS = [
  { id: 'archive', label: 'Archive' },
  { id: 'jamendo', label: 'Jamendo' },
  { id: 'spotify', label: 'Spotify' },
]

Page(
  BasePage({
    name: 'soniq.results',

    onInit(params) {
      this.params = parseParams(params)
      this.query = String(this.params.query || '')
      this.provider = String(this.params.provider || 'archive')
      this.rows = []
    },

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.unsubscribers = []

      background(null)
      header(null, {
        title: truncate(this.query || 'Results', 26),
        subtitle: this.providerLabel(),
        actionIcon: 'icon/search.png',
        onAction: () => navTo('page/search/index.page'),
      })

      const chipRefs = drawProviderRow(null, {
        y: 60,
        providers: PROVIDERS,
        active: this.provider,
        onSelect: (id) => this.switchProvider(id),
      })
      this.chipWidgets = chipRefs.chips.map((chip) => chip.widget)

      this.listY = 104
      this.listH = 330
      this.statusRef = text(null, {
        x: M.pad,
        y: 200,
        w: M.contentW,
        h: 40,
        text: 'Searching\u2026',
        text_size: F.sm,
        color: C.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })

      this.subscribe()
      this.runSearch(true)
    },

    onDestroy() {
      this.unsubscribers.forEach((off) => off())
      this.unsubscribers = []
      if (this.listRef) destroyList(this.listRef)
      this.listRef = null
    },

    subscribe() {
      const state = this.store
      const on = (event, handler) => {
        state.bus.on(event, handler)
        this.unsubscribers.push(() => state.bus.off(event, handler))
      }
      on('library', () => this.renderRows())
      on('download-done', () => this.renderRows())
      on('download-error', ({ trackId }) => {
        if (this.rows.some((row) => row.track && row.track.id === trackId)) this.renderRows()
      })
    },

    providerLabel() {
      if (this.provider === 'spotify') return 'Spotify catalogue'
      if (this.provider === 'jamendo') return 'Jamendo \u2022 Creative Commons'
      return 'Internet Archive \u2022 Creative Commons'
    },

    switchProvider(id) {
      if (id === this.provider) return
      if (id === 'spotify' && !this.store.spotify.authenticated) {
        showToast({ content: 'Connect Spotify in the Zepp app first.' })
        return
      }
      this.provider = id
      this.store.ui.searchProvider = id
      this.rebuildChips()
      this.runSearch(true)
    },

    rebuildChips() {
      this.chipWidgets.forEach((widgetRef) => {
        try {
          deleteWidget(widgetRef)
        } catch (error) {
          // ignore
        }
      })
      const refs = drawProviderRow(null, {
        y: 60,
        providers: PROVIDERS,
        active: this.provider,
        onSelect: (id) => this.switchProvider(id),
      })
      this.chipWidgets = refs.chips.map((chip) => chip.widget)
    },

    async runSearch(showLoader) {
      const cacheKey = `${this.provider}:${this.query}`
      if (showLoader) this.showStatus('Searching\u2026', C.textDim)
      if (this.store.ui.searchCachedFor === cacheKey && this.store.ui.searchResults.length) {
        this.setRows(this.store.ui.searchResults)
      }

      try {
        let items = []
        if (this.provider === 'spotify') {
          const result = await this.bridge.spotifySearch(this.query)
          items = (result && result.tracks) || []
        } else {
          const result = await this.bridge.musicSearch(this.query, this.provider)
          items = (result && result.items) || []
        }
        if (!items.length) {
          this.rows = []
          this.renderRows()
          this.showStatus('No results found.\nTry a different search.', C.textDim)
          return
        }
        this.store.ui.searchResults = items
        this.store.ui.searchCachedFor = cacheKey
        this.setRows(items)
      } catch (error) {
        this.rows = []
        this.renderRows()
        this.showStatus(friendlyError(error, 'Search failed.'), C.red)
      }
    },

    setRows(items) {
      this.items = items
      this.rows = items.map((track) => ({
        track,
        title: truncate(track.title, 26),
        subtitle: truncate(
          `${track.artist}${track.duration ? ` \u2022 ${formatTime(track.duration)}` : ''}`,
          34,
        ),
        art: track.artworkPath || 'artwork/placeholder.png',
        action: actionIconFor(this.store, track),
      }))
      this.renderRows()
      if (this.rows.length) this.hideStatus()
    },

    renderRows() {
      if (!this.rows.length) return
      if (this.listRef) destroyList(this.listRef)
      const data = this.rows.map((row) => ({
        title: row.title,
        subtitle: row.subtitle,
        art: row.art,
        action: row.track ? actionIconFor(this.store, row.track) : row.action,
      }))

      this.listRef = createWidget(widget.SCROLL_LIST, {
        x: M.pad,
        y: this.listY,
        w: M.contentW,
        h: this.listH,
        item_space: 6,
        item_config: [
          {
            type_id: 1,
            item_height: 72,
            item_bg_color: C.surface,
            item_bg_radius: 14,
            text_view: [
              {
                x: 74,
                y: 10,
                w: 214,
                h: 24,
                key: 'title',
                color: C.text,
                text_size: F.sm,
              },
              {
                x: 74,
                y: 36,
                w: 214,
                h: 18,
                key: 'subtitle',
                color: C.textDim,
                text_size: F.xxs,
              },
            ],
            text_view_count: 2,
            image_view: [
              { x: 12, y: 12, w: 48, h: 48, key: 'art' },
              { x: 298, y: 22, w: 28, h: 28, key: 'action', action: true },
            ],
            image_view_count: 2,
          },
        ],
        item_config_count: 1,
        data_array: data,
        data_count: data.length,
        item_click_func: (list, index, key) => this.onRowClick(index, key),
      })
    },

    onRowClick(index, key) {
      const row = this.rows[index]
      if (!row || !row.track) return
      const track = row.track

      if (key === 'action') {
        if (track.provider === 'spotify') {
          this.playSpotify(track)
          return
        }
        const record = this.store.downloadsMgr.stateFor(track)
        if (record.phase === 'done' || hasTrack(this.store, track.id)) {
          navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' })
          return
        }
        if (record.phase !== 'idle' && record.phase !== 'error' && record.phase !== 'canceled') {
          this.store.downloadsMgr.cancel(track.id)
          this.renderRows()
          return
        }
        this.store.downloadsMgr.start(track)
        this.renderRows()
        return
      }

      if (track.provider === 'spotify') {
        this.playSpotify(track)
        return
      }
      this.store.temp = this.store.temp || {}
      this.store.temp.selectedTrack = track
      navTo('page/track/index.page', { id: track.id })
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
        await this.bridge.spotifyControl('play', { uri: track.spotifyUri })
        state.current = { ...track, source: 'spotify' }
        state.playback.source = 'spotify'
        state.playback.isPlaying = true
        state.playback.duration = track.duration || 0
        state.playback.position = 0
        showToast({ content: `Playing ${truncate(track.title, 20)} on Spotify` })
      } catch (error) {
        showToast({ content: friendlyError(error) })
      }
    },

    showStatus(message, color) {
      if (this.listRef) destroyList(this.listRef)
      this.listRef = null
      setText(this.statusRef, message)
      set(this.statusRef, { color })
    },

    hideStatus() {
      setText(this.statusRef, '')
    },
  }),
)

function actionIconFor(state, track) {
  if (track.provider === 'spotify') return 'icon/play.png'
  if (hasTrack(state, track.id)) return 'icon/downloaded.png'
  const record = state.downloadsMgr ? state.downloadsMgr.stateFor(track) : null
  if (record && record.phase && record.phase !== 'idle' && record.phase !== 'error' && record.phase !== 'done' && record.phase !== 'canceled') {
    return 'icon/close.png'
  }
  return 'icon/download.png'
}

function destroyList(list) {
  try {
    deleteWidget(list)
  } catch (error) {
    // ignore
  }
}

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
