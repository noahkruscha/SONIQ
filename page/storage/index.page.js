import { BasePage } from '@zeppos/zml/base-page'
import { align } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { formatBytes } from '../../shared/format'
import { APP_VERSION } from '../../shared/constants'
import { cleanupFiles, stats } from '../../lib/library'
import { background, header, navTo } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F } from '../../lib/theme'
import { image, rect, set, setText, text } from '../../lib/ui-kit'

Page(
  BasePage({
    name: 'soniq.storage',

    build() {
      this.store = getState()
      this.cleanupArmedAt = 0
      this.unsubscribers = []

      background(null)
      header(null, {
        title: 'Storage',
        subtitle: `v${APP_VERSION} \u00b7 watch memory`,
        actionIcon: 'icon/refresh.png',
        onAction: () => this.store.downloadsMgr.refreshDisk(),
      })

      this.refs = {}
      this.refs.free = text(null, {
        x: 24,
        y: 68,
        w: 342,
        h: 44,
        text: '\u2014',
        text_size: 34,
        color: C.text,
      })
      this.refs.total = text(null, {
        x: 24,
        y: 116,
        w: 342,
        h: 22,
        text: 'Reading disk information\u2026',
        text_size: F.xxs,
        color: C.textDim,
      })
      rect(null, { x: 24, y: 140, w: 342, h: 8, color: C.track, radius: 4 })
      this.refs.usedFill = rect(null, { x: 24, y: 140, w: 1, h: 8, color: C.green, radius: 4 })

      rect(null, { x: 24, y: 160, w: 342, h: 146, color: C.surface, radius: 18 })
      this.refs.rows = []
      const rows = [
        { label: 'Downloaded music', key: 'library' },
        { label: 'Mini programs', key: 'app' },
        { label: 'Watch faces', key: 'watchface' },
        { label: 'System', key: 'system' },
        { label: 'Other music', key: 'music' },
      ]
      rows.forEach((row, index) => {
        const y = 170 + index * 27
        text(null, { x: 40, y, w: 220, h: 24, text: row.label, text_size: F.xs, color: C.textDim })
        this.refs.rows.push({
          key: row.key,
          widget: text(null, {
            x: 220,
            y,
            w: 130,
            h: 24,
            text: '\u2014',
            text_size: F.xs,
            color: C.text,
            align_h: align.RIGHT,
          }),
        })
      })

      rect(null, {
        x: 24,
        y: 318,
        w: 342,
        h: 56,
        color: C.surface,
        radius: 16,
        click_func: () => navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' }),
      })
      image(null, { x: 40, y: 332, w: 28, h: 28, src: 'icon/downloaded.png' })
      text(null, { x: 80, y: 322, w: 240, h: 28, text: 'Manage downloads', text_size: F.xs, color: C.text })
      this.refs.manageSub = text(null, {
        x: 80,
        y: 348,
        w: 240,
        h: 20,
        text: '',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(null, { x: 330, y: 335, w: 22, h: 22, src: 'icon/chevron.png' })

      rect(null, {
        x: 24,
        y: 386,
        w: 342,
        h: 56,
        color: C.surface,
        radius: 16,
        click_func: () => this.onCleanup(),
      })
      image(null, { x: 40, y: 400, w: 28, h: 28, src: 'icon/trash.png' })
      text(null, { x: 80, y: 390, w: 250, h: 28, text: 'Clean up files', text_size: F.xs, color: C.text })
      this.refs.cleanupSub = text(null, {
        x: 80,
        y: 416,
        w: 250,
        h: 20,
        text: 'Remove incomplete downloads',
        text_size: F.xxs,
        color: C.textDim,
      })


      this.subscribe()
      this.refresh()
      this.store.downloadsMgr.refreshDisk()
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
      on('storage', () => this.refresh())
      on('library', () => this.refresh())
      on('download-done', () => this.refresh())
    },

    refresh() {
      const state = this.store
      const disk = state.system.disk
      const info = stats(state)
      setText(
        this.refs.manageSub,
        `${info.count} ${info.count === 1 ? 'track' : 'tracks'} \u2022 ${formatBytes(info.bytes)}`,
      )
      if (!disk) {
        setText(this.refs.free, 'Checking\u2026')
        return
      }
      setText(this.refs.free, `${formatBytes(disk.free)} free`)
      setText(
        this.refs.total,
        `of ${formatBytes(disk.total)} \u2022 ${disk.usedPercent}% used`,
      )
      const width = Math.max(1, Math.round((342 * disk.usedPercent) / 100))
      set(this.refs.usedFill, { x: 24, y: 140, w: width, h: 8 })

      const values = {
        library: info.bytes,
        app: disk.app,
        watchface: disk.watchface,
        system: disk.system,
        music: disk.music,
      }
      this.refs.rows.forEach((row) => {
        setText(row.widget, formatBytes(values[row.key] || 0))
      })
    },

    onCleanup() {
      const now = Date.now()
      if (now - this.cleanupArmedAt > 4000) {
        this.cleanupArmedAt = now
        setText(this.refs.cleanupSub, 'Tap again to clean up')
        set(this.refs.cleanupSub, { color: C.amber })
        showToast({ content: 'Tap again to remove unused files.' })
        return
      }
      this.cleanupArmedAt = 0
      const removed = cleanupFiles(this.store)
      setText(this.refs.cleanupSub, removed ? `Removed ${removed} file(s)` : 'Nothing to clean up')
      set(this.refs.cleanupSub, { color: removed ? C.green : C.textDim })
      showToast({ content: removed ? `Freed ${removed} file(s)` : 'Nothing to clean up' })
      this.store.downloadsMgr.refreshDisk()
      this.refresh()
    },
  }),
)
