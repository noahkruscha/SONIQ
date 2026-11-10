import { BasePage } from '@zeppos/zml/base-page'
import { align } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { formatBytes, formatTime, percent, truncate } from '../../shared/format'
import { canFit, estimateDownloadBytes } from '../../shared/storage'
import { isDownloadable } from '../../shared/tracks'
import { createBridge } from '../../lib/api'
import { getItem, hasTrack, removeDownloaded, sorted } from '../../lib/library'
import { background, header, navTo } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F, M } from '../../lib/theme'
import {
  image,
  primaryButton,
  rect,
  set,
  setSrc,
  setText,
  setVisible,
  text,
} from '../../lib/ui-kit'

const BAR_W = 294

Page(
  BasePage({
    name: 'soniq.track',

    onInit(params) {
      this.params = parseParams(params)
    },

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.autoPlayOnDone = false
      this.deleteArmedAt = 0
      this.unsubscribers = []

      const track = this.resolveTrack()
      this.track = track

      background(null)
      header(null, {
        title: 'Track',
        subtitle: track ? this.providerLabel(track) : '',
      })

      if (!track) {
        text(null, {
          x: 30,
          y: 200,
          w: M.width - 60,
          h: 40,
          text: 'This track is no longer available.',
          text_size: F.sm,
          color: C.textDim,
          align_h: align.CENTER_H,
        })
        return
      }

      rect(null, { x: 135, y: 70, w: 120, h: 120, color: 0x101012, radius: 18 })
      this.refs = {}
      this.refs.artwork = image(null, {
        x: 138,
        y: 73,
        w: 114,
        h: 114,
        src: track.artworkPath || 'artwork/placeholder.png',
      })

      this.refs.title = text(null, {
        x: 20,
        y: 202,
        w: 350,
        h: 34,
        text: truncate(track.title, 26),
        text_size: 24,
        color: C.text,
        align_h: align.CENTER_H,
      })
      this.refs.artist = text(null, {
        x: 20,
        y: 236,
        w: 350,
        h: 26,
        text: truncate(track.artist, 30),
        text_size: 20,
        color: C.textDim,
        align_h: align.CENTER_H,
      })
      this.refs.meta = text(null, {
        x: 20,
        y: 262,
        w: 350,
        h: 20,
        text: this.metaLine(track),
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.CENTER_H,
      })
      this.refs.license = text(null, {
        x: 20,
        y: 282,
        w: 350,
        h: 20,
        text: this.licenseLine(track),
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.CENTER_H,
      })

      rect(null, { x: 24, y: 302, w: 342, h: 66, color: C.surface, radius: 16 })
      this.refs.status = text(null, {
        x: 40,
        y: 308,
        w: 310,
        h: 22,
        text: '',
        text_size: F.xxs,
        color: C.textDim,
      })
      rect(null, { x: 48, y: 332, w: BAR_W, h: 5, color: C.track, radius: 3 })
      this.refs.fill = rect(null, { x: 48, y: 332, w: 1, h: 5, color: C.green, radius: 3 })

      this.refs.storage = text(null, {
        x: 40,
        y: 344,
        w: 310,
        h: 20,
        text: '',
        text_size: F.xxs,
        color: C.textMuted,
        align_h: align.CENTER_H,
      })

      this.refs.primary = primaryButton(null, {
        x: 24,
        y: 376,
        w: 342,
        h: 48,
        text: 'Download',
        onClick: () => this.onPrimary(),
      })

      this.refs.openList = text(null, {
        x: 24,
        y: 428,
        w: 240,
        h: 22,
        text: 'Open Downloaded',
        text_size: F.xxs,
        color: C.textDim,
        click_func: () => navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' }),
      })
      this.refs.trash = image(null, {
        x: 330,
        y: 424,
        w: 26,
        h: 26,
        src: 'icon/trash.png',
        click_func: () => this.onDelete(),
      })

      this.subscribe()
      this.refresh()
      this.store.downloadsMgr.refreshDisk()
      this.store.downloadsMgr.ensureArtwork(track)
      this.refreshStorage()
    },

    onDestroy() {
      this.unsubscribers.forEach((off) => off())
      this.unsubscribers = []
    },

    subscribe() {
      const state = this.store
      const on = (event, handler) => {
        state.bus.on(event, handler)
        this.unsubscribers.push(() => state.bus.off(event, handler))
      }
      on('downloads', () => this.refresh())
      on('download-progress', () => this.refresh())
      on('download-done', ({ track }) => {
        if (!track || track.id !== this.track.id) return
        this.refresh()
        if (this.autoPlayOnDone) {
          this.autoPlayOnDone = false
          this.playDownloaded()
        }
      })
      on('download-error', () => this.refresh())
      on('library', () => this.refresh())
      on('storage', () => this.refreshStorage())
      on('artwork', ({ trackId, artworkPath }) => {
        if (trackId === this.track.id) setSrc(this.refs.artwork, artworkPath)
      })
    },

    resolveTrack() {
      const state = this.store
      const selected = state.temp && state.temp.selectedTrack
      const id = this.params.id
      if (selected && (!id || selected.id === id)) return { ...selected }
      const item = id ? getItem(state, id) : null
      if (item) return { ...item }
      if (selected) return { ...selected }
      return null
    },

    providerLabel(track) {
      if (track.provider === 'jamendo') return 'Jamendo \u2022 MP3 128 kbps'
      if (track.provider === 'openverse') return 'Openverse \u2022 Creative Commons'
      if (track.provider === 'link') return 'Direct link \u2022 MP3'
      if (track.provider === 'archive') return 'Internet Archive \u2022 MP3'
      if (track.provider === 'spotify') return 'Spotify catalogue'
      return 'On this watch'
    },

    metaLine(track) {
      const duration = track.duration ? formatTime(track.duration) : '\u2014'
      const size = track.size
        ? formatBytes(track.size)
        : track.duration
          ? `~${formatBytes(estimateDownloadBytes(track.duration))}`
          : ''
      return size ? `${duration} \u2022 ${size} \u2022 MP3` : `${duration} \u2022 MP3`
    },

    licenseLine(track) {
      const license = String(track.license || '').toLowerCase()
      if (license.indexOf('creativecommons.org') !== -1) return 'Creative Commons licence \u2022 free to download'
      if (license.indexOf('publicdomain') !== -1) return 'Public domain \u2022 free to download'
      if (track.provider === 'spotify') return 'Spotify streaming audio is DRM protected'
      return 'Authorised downloadable source'
    },

    onPrimary() {
      const state = this.store
      const record = state.downloadsMgr.stateFor(this.track)
      if (record.phase === 'done' || hasTrack(state, this.track.id)) {
        this.playDownloaded()
        return
      }
      if (record.phase === 'downloading' || record.phase === 'transferring' || record.phase === 'checking' || record.phase === 'saving') {
        state.downloadsMgr.cancel(this.track.id)
        this.refresh()
        return
      }
      if (!isDownloadable(this.track)) {
        showToast({ content: 'No downloadable audio for this track.' })
        return
      }
      this.autoPlayOnDone = true
      const started = state.downloadsMgr.start(this.track)
      if (!started) this.autoPlayOnDone = false
      this.refresh()
    },

    playDownloaded() {
      const state = this.store
      const item = getItem(state, this.track.id)
      if (!item) {
        showToast({ content: 'This file is no longer on the watch.' })
        return
      }
      const items = sorted(state)
      const index = items.findIndex((entry) => entry.id === this.track.id)
      state.player.setQueue(items, index < 0 ? 0 : index, { autoplay: true })
      navTo('page/home/index.page')
    },

    onDelete() {
      const state = this.store
      if (!hasTrack(state, this.track.id)) {
        showToast({ content: 'Not downloaded.' })
        return
      }
      const now = Date.now()
      if (now - this.deleteArmedAt > 4000) {
        this.deleteArmedAt = now
        showToast({ content: 'Tap again to delete from the watch.' })
        return
      }
      this.deleteArmedAt = 0
      removeDownloaded(state, this.track.id)
      showToast({ content: 'Removed from Downloaded.' })
      this.refresh()
    },

    refresh() {
      const state = this.store
      const record = state.downloadsMgr.stateFor(this.track)
      const downloaded = hasTrack(state, this.track.id)
      const item = getItem(state, this.track.id)

      let status = ''
      let color = C.textDim
      if (record.phase === 'done' || downloaded) {
        status = `Saved on the watch${item ? ` \u2022 ${formatBytes(item.size)}` : ''}`
        color = C.green
      } else if (record.phase === 'error') {
        status = record.error || 'Download failed.'
        color = C.red
      } else if (record.phase && record.phase !== 'idle') {
        status = state.downloadsMgr.statusLabel(record)
        color = C.green
      } else {
        status = 'Ready to download in MP3 quality'
      }

      setText(this.refs.status, status)
      set(this.refs.status, { color })

      const pct = record.phase === 'done' ? 100 : percent(record.progress, 100)
      const width = Math.max(1, Math.round((BAR_W * pct) / 100))
      set(this.refs.fill, { x: 48, y: 332, w: width, h: 5 })

      let label = 'Download'
      if (downloaded) label = 'Play'
      else if (record.phase === 'error' || record.phase === 'canceled') label = 'Retry download'
      else if (record.phase && record.phase !== 'idle') label = 'Cancel download'
      setText(this.refs.primary.labelWidget, label)
      const buttonGeometry = this.refs.primary.geometry || { x: 24, y: 376, w: 342, h: 48 }
      set(this.refs.primary.bgWidget, {
        ...buttonGeometry,
        color: downloaded ? C.green : record.phase === 'downloading' || record.phase === 'transferring' ? C.surfaceAlt : C.green,
      })

      setVisible(this.refs.trash, downloaded)
      setVisible(this.refs.openList, downloaded)
      if (downloaded) setSrc(this.refs.artwork, (item && item.artworkPath) || this.track.artworkPath || 'artwork/placeholder.png')
    },

    refreshStorage() {
      const disk = this.store.system.disk
      if (!disk || !this.refs.storage) return
      const need = this.track.size || estimateDownloadBytes(this.track.duration || 180)
      const fits = canFit(disk.free, Math.ceil(need * 1.15), 8 * 1024 * 1024)
      setText(
        this.refs.storage,
        fits
          ? `${formatBytes(disk.free)} free on the watch`
          : 'Not enough free space for this download',
      )
      set(this.refs.storage, { color: fits ? C.textMuted : C.red })
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
