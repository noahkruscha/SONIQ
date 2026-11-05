import { BasePage } from '@zeppos/zml/base-page'
import { align, deleteWidget } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { truncate } from '../../shared/format'
import { createBridge } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { hasBackgroundPermission, requestBackgroundPermission } from '../../lib/background'
import { background, header } from '../../lib/page-kit'
import { getState, saveSettings } from '../../lib/state'
import { C, F } from '../../lib/theme'
import { iconButton, image, rect, set, setText, setVisible, text } from '../../lib/ui-kit'

const BAR_W = 196

Page(
  BasePage({
    name: 'soniq.output',

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.deviceWidgets = []
      this.devicesLoading = false

      background(null)
      header(null, {
        title: 'Audio output',
        subtitle: 'Where sound plays',
      })

      // Local (watch) output ------------------------------------------------
      rect(null, { x: 24, y: 66, w: 342, h: 156, color: C.surface, radius: 16 })
      text(null, { x: 42, y: 74, w: 280, h: 22, text: 'This watch', text_size: F.md, color: C.text })
      text(null, {
        x: 42,
        y: 96,
        w: 300,
        h: 16,
        text: 'Speaker or paired Bluetooth headset',
        text_size: F.xxs,
        color: C.textDim,
      })
      text(null, {
        x: 42,
        y: 114,
        w: 306,
        h: 14,
        text: 'Zepp OS routes audio; apps cannot pick speaker vs headset.',
        text_size: 9,
        color: C.textMuted,
      })

      this.refs = {}
      this.refs.minus = iconButton(null, {
        x: 38,
        y: 134,
        size: 26,
        src: 'icon/minus.png',
        onClick: () => this.changeVolume(-10),
      })
      rect(null, { x: 74, y: 146, w: BAR_W, h: 4, color: C.track, radius: 2 })
      this.refs.volumeFill = rect(null, { x: 74, y: 146, w: 1, h: 4, color: C.green, radius: 2 })
      this.refs.plus = iconButton(null, {
        x: 280,
        y: 134,
        size: 26,
        src: 'icon/plus.png',
        onClick: () => this.changeVolume(10),
      })
      this.refs.volumeText = text(null, {
        x: 312,
        y: 134,
        w: 44,
        h: 26,
        text: '70%',
        text_size: F.xxs,
        color: C.textDim,
        align_h: align.RIGHT,
        align_v: align.CENTER_V,
      })

      rect(null, {
        x: 34,
        y: 168,
        w: 322,
        h: 26,
        color: C.surfaceAlt,
        radius: 8,
        click_func: () => this.toggleBackground(),
      })
      text(null, {
        x: 42,
        y: 168,
        w: 200,
        h: 26,
        text: 'Keep playing after exit',
        text_size: F.xxs,
        color: C.text,
        align_v: align.CENTER_V,
      })
      this.refs.bgStatus = text(null, {
        x: 244,
        y: 168,
        w: 104,
        h: 26,
        text: 'Off',
        text_size: F.xxs,
        color: C.textDim,
        align_h: align.RIGHT,
        align_v: align.CENTER_V,
      })

      // Spotify Connect ----------------------------------------------------
      text(null, { x: 24, y: 232, w: 240, h: 16, text: 'SPOTIFY CONNECT', text_size: F.xxs, color: C.textMuted })
      this.refs.refresh = iconButton(null, {
        x: 336,
        y: 226,
        size: 24,
        src: 'icon/refresh.png',
        onClick: () => this.loadDevices(true),
      })

      this.refs.status = text(null, {
        x: 24,
        y: 250,
        w: 342,
        h: 80,
        text: 'Checking Spotify\u2026',
        text_size: F.xs,
        color: C.textDim,
      })

      this.refreshVolume()
      this.refreshBackground()
      this.loadDevices(false)
    },

    refreshBackground() {
      const state = this.store
      const enabled = Boolean(state.settings.backgroundPlayback) && hasBackgroundPermission()
      const label = enabled
        ? 'On'
        : state.settings.backgroundPlayback
          ? 'Allow'
          : 'Off'
      setText(this.refs.bgStatus, label)
      set(this.refs.bgStatus, { color: enabled ? C.green : label === 'Allow' ? C.amber : C.textDim })
    },

    toggleBackground() {
      const state = this.store
      if (!hasBackgroundPermission()) {
        requestBackgroundPermission((granted) => {
          state.settings.backgroundPlayback = granted
          saveSettings(state)
          this.refreshBackground()
          showToast({
            content: granted
              ? 'Background playback enabled.'
              : 'Background playback needs permission.',
          })
        })
        return
      }
      state.settings.backgroundPlayback = !state.settings.backgroundPlayback
      saveSettings(state)
      this.refreshBackground()
      showToast({
        content: state.settings.backgroundPlayback
          ? 'Keeps playing after you exit.'
          : 'Playback stops when you exit.',
      })
    },

    refreshVolume() {
      const state = this.store
      const volume = state.player ? state.player.getVolume() : state.settings.volume || 0
      const pct = Math.max(0, Math.min(100, Number(volume) || 0))
      set(this.refs.volumeFill, {
        x: 74,
        y: 146,
        w: Math.max(1, Math.round((BAR_W * pct) / 100)),
        h: 4,
      })
      setText(this.refs.volumeText, `${Math.round(pct)}%`)
    },

    changeVolume(delta) {
      const state = this.store
      if (!state.player) return
      const current = state.player.getVolume()
      const next = Math.max(0, Math.min(100, Math.round(current) + delta))
      state.player.applyVolume(next)
      this.refreshVolume()
    },

    async loadDevices(showToastOnError) {
      if (this.devicesLoading) return
      this.devicesLoading = true
      const state = this.store
      this.clearDeviceRows()

      if (!state.spotify.authenticated) {
        this.renderConnectPrompt()
        this.devicesLoading = false
        return
      }

      setVisible(this.refs.status, true)
      setText(this.refs.status, 'Looking for Spotify devices\u2026')
      if (showToastOnError) set(this.refs.status, { color: C.textDim })

      try {
        const result = await this.bridge.spotifyDevices()
        const devices = (result && result.items) || []
        state.spotify.devices = devices
        state.spotify.devicesLoaded = true
        state.spotify.devicesError = ''
        if (!devices.length) {
          setVisible(this.refs.status, true)
          setText(
            this.refs.status,
            'No Spotify devices online.\nOpen Spotify on your phone or speaker first.',
          )
          set(this.refs.status, { color: C.textDim })
          this.devicesLoading = false
          return
        }
        setText(this.refs.status, '')
        setVisible(this.refs.status, false)
        this.renderDevices(devices)
      } catch (error) {
        state.spotify.devicesError = friendlyError(error, 'Could not load Spotify devices.')
        setText(this.refs.status, state.spotify.devicesError)
        set(this.refs.status, { color: C.red })
        if (showToastOnError) showToast({ content: state.spotify.devicesError })
      }
      this.devicesLoading = false
    },

    clearDeviceRows() {
      this.deviceWidgets.forEach((widgetRef) => {
        try {
          deleteWidget(widgetRef)
        } catch (error) {
          // ignore
        }
      })
      this.deviceWidgets = []
      setVisible(this.refs.status, true)
    },

    renderConnectPrompt() {
      setText(this.refs.status, '')
      setVisible(this.refs.status, false)
      const card = rect(null, {
        x: 24,
        y: 250,
        w: 342,
        h: 84,
        color: C.surface,
        radius: 16,
        click_func: () => showToast({ content: 'Zepp app > Profile > SONIQ > Settings' }),
      })
      const title = text(null, {
        x: 42,
        y: 262,
        w: 300,
        h: 22,
        text: 'Connect Spotify',
        text_size: F.sm,
        color: C.text,
      })
      const body = text(null, {
        x: 42,
        y: 286,
        w: 300,
        h: 34,
        text: 'Add your Client ID and sign in from the Zepp app to control Spotify Connect devices.',
        text_size: 10,
        color: C.textDim,
      })
      this.deviceWidgets.push(card, title, body)
    },

    renderDevices(devices) {
      devices.slice(0, 3).forEach((device, index) => {
        const y = 250 + index * 64
        const active = device.isActive
        const card = rect(null, {
          x: 24,
          y,
          w: 342,
          h: 58,
          color: active ? 0x12261a : C.surface,
          radius: 14,
          click_func: () => this.selectDevice(device),
        })
        const icon = image(null, { x: 40, y: y + 17, w: 24, h: 24, src: 'icon/speaker.png' })
        const name = text(null, {
          x: 78,
          y: y + 8,
          w: 200,
          h: 22,
          text: truncate(device.name, 24),
          text_size: F.sm,
          color: C.text,
        })
        const subtitle = text(null, {
          x: 78,
          y: y + 30,
          w: 200,
          h: 16,
          text: active ? 'Active device' : `${device.type || 'Device'} \u2022 ${device.volume}%`,
          text_size: F.xxs,
          color: active ? C.green : C.textDim,
        })
        const badge = active
          ? text(null, {
              x: 288,
              y: y + 18,
              w: 62,
              h: 22,
              text: 'ACTIVE',
              text_size: 9,
              color: C.green,
              align_h: align.RIGHT,
              align_v: align.CENTER_V,
            })
          : text(null, {
              x: 286,
              y: y + 18,
              w: 64,
              h: 22,
              text: 'USE',
              text_size: 9,
              color: C.textMuted,
              align_h: align.RIGHT,
              align_v: align.CENTER_V,
            })
        this.deviceWidgets.push(card, icon, name, subtitle, badge)
      })

    },

    async selectDevice(device) {
      const state = this.store
      if (device.isActive) {
        showToast({ content: 'Already playing here.' })
        return
      }
      if (!state.spotify.premium) {
        showToast({ content: 'Spotify playback needs Premium.' })
        return
      }
      try {
        await this.bridge.spotifyTransfer(device.id)
        state.settings.lastSpotifyDeviceId = device.id
        showToast({ content: `Switched to ${truncate(device.name, 18)}` })
        await this.loadDevices(false)
      } catch (error) {
        showToast({ content: friendlyError(error) })
      }
    },
  }),
)
