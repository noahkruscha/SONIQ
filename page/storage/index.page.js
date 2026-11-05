import { BasePage } from '@zeppos/zml/base-page'
import { align } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { formatBytes } from '../../shared/format'
import { STORAGE_RESERVE_BYTES } from '../../shared/constants'
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
        subtitle: 'Watch memory',
        actionIcon: 'icon/refresh.png',
        onAction: () => this.store.downloadsMgr.refreshDisk(),
      })

      this.refs = {}
      this.refs.free = text(null, {
        x: 24,
        y: 66,
        w: 342,
        h: 32,
        text: '\u2014',
        text_size: 26,
        color: C.text,
      })
      this.refs.total = text(null, {
        x: 24,
        y: 98,
        w: 342,
        h: 16,
        text: 'Reading disk information\u2026',
        text_size: F.xxs,
        color: C.textDim,
      })
      rect(null, { x: 24, y: 120, w: 342, h: 6, color: C.track, radius: 3 })
      this.refs.usedFill = rect(null, { x: 24, y: 120, w: 1, h: 6, color: C.green, radius: 3 })

      rect(null, { x: 24, y: 140, w: 342, h: 138, color: C.surface, radius: 16 })
      this.refs.rows = []
      const rows = [
        { label: 'Downloaded music', key: 'library' },
        { label: 'Mini programs', key: 'app' },
        { label: 'Watch faces', key: 'watchface' },
        { label: 'System', key: 'system' },
        { label: 'Other music', key: 'music' },
      ]
      rows.forEach((row, index) => {
        const y = 150 + index * 25
        text(null, { x: 40, y, w: 220, h: 20, text: row.label, text_size: F.xs, color: C.textDim })
        this.refs.rows.push({
          key: row.key,
          widget: text(null, {
            x: 220,
            y,
            w: 130,
            h: 20,
            text: '\u2014',
            text_size: F.xs,
            color: C.text,
            align_h: align.RIGHT,
          }),
        })
      })

      rect(null, {
        x: 24,
        y: 290,
        w: 342,
        h: 52,
        color: C.surface,
        radius: 14,
        click_func: () => navTo('page/playlist/index.page', { kind: 'downloaded', name: 'Downloaded' }),
      })
      image(null, { x: 40, y: 304, w: 24, h: 24, src: 'icon/downloaded.png' })
      text(null, { x: 78, y: 296, w: 240, h: 20, text: 'Manage downloads', text_size: F.sm, color: C.text })
      this.refs.manageSub = text(null, {
        x: 78,
        y: 316,
        w: 240,
        h: 16,
        text: '',
        text_size: F.xxs,
        color: C.textDim,
      })
      image(null, { x: 330, y: 306, w: 18, h: 18, src: 'icon/chevron.png' })

      rect(null, {
        x: 24,
        y: 350,
        w: 342,
        h: 52,
        color: C.surface,
        radius: 14,
        click_func: () => this.onCleanup(),
      })
      image(null, { x: 40, y: 364, w: 24, h: 24, src: 'icon/trash.png' })
      text(null, { x: 78, y: 356, w: 250, h: 20, text: 'Clean up files', text_size: F.sm, color: C.text })
      this.refs.cleanupSub = text(null, {
        x: 78,
        y: 376,
        w: 250,
        h: 16,
        text: 'Remove incomplete downloads',
        text_size: F.xxs,
        color: C.textDim,
      })

      text(null, {
        x: 24,
        y: 414,
        w: 342,
        h: 30,
        text: `SONIQ keeps ${formatBytes(STORAGE_RESERVE_BYTES)} free for the system.`,
        text_size: 9,
        color: C.textMuted,
        align_h: align.CENTER_H,
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
      set(this.refs.usedFill, { x: 24, y: 120, w: width, h: 6 })

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
