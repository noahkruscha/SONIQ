import { BaseApp } from '@zeppos/zml/base-app'
import { createState, emit, loadSettings, saveSettings } from './lib/state'
import { initLibrary, persistLibrary } from './lib/library'
import { createPlayerService } from './lib/player'
import { createDownloadManager } from './lib/downloads'
import {
  clearHandoffState,
  handoffToBackground,
  isServiceRunning,
  readHandoffState,
  stopBackgroundService,
} from './lib/background'
import { createBridge } from './lib/api'
import { removeFile } from './lib/persist'

App(
  BaseApp({
    globalData: {},

    onCreate() {
      const state = createState()
      this.globalData.soniq = state
      state.app = this

      state.settings = loadSettings()
      initLibrary(state)

      // Take playback back from the background service if it is still running.
      if (isServiceRunning()) stopBackgroundService()
      const handoff = readHandoffState()
      clearHandoffState()

      const lastId =
        (handoff && handoff.trackId) || state.settings.lastTrackId || ''
      const items = state.library.items
      const index = items.findIndex((item) => item.id === lastId)
      if (index >= 0) {
        state.current = { ...items[index] }
        state.playback.duration = items[index].duration || 0
        state.queue = items.slice()
        state.queueIndex = index
      } else if (handoff && handoff.file) {
        state.current = {
          id: handoff.trackId,
          title: handoff.title,
          artist: handoff.artist,
          album: '',
          duration: handoff.duration || 0,
          provider: 'local',
          source: 'local',
          file: handoff.file,
          artworkPath: handoff.artworkPath || '',
          size: 0,
        }
        state.queue = [state.current]
        state.queueIndex = 0
        state.playback.duration = handoff.duration || 0
      }

      state.player = createPlayerService(state)
      state.downloadsMgr = createDownloadManager(state, this.request.bind(this))

      state.bus.on('track', () => saveSettings(state))
      state.bus.on('download-done', ({ track }) => {
        if (track && track.artworkUrl) state.downloadsMgr.ensureArtwork(track)
      })

      if (state.current && state.current.artworkUrl) {
        state.downloadsMgr.ensureArtwork(state.current)
      }

      // Warm the Spotify connection state; failure is non-fatal (offline use).
      const bridge = createBridge(this.request.bind(this))
      bridge
        .spotifyStatus()
        .then((status) => {
          if (!status) return
          state.spotify.authenticated = Boolean(status.authenticated)
          state.spotify.premium = Boolean(status.premium)
          state.spotify.user = status.user || ''
          state.spotify.country = status.country || ''
          emit(state, 'spotify', state.spotify)
        })
        .catch(() => {})

      state.downloadsMgr.refreshDisk()
    },

    onReceivedFile(file) {
      const state = this.globalData.soniq
      if (state && state.downloadsMgr) state.downloadsMgr.handleFile(file)
    },

    onCall(payload) {
      const state = this.globalData.soniq
      if (!state || !state.downloadsMgr) return
      state.downloadsMgr.onSideCall(payload)
    },

    onDestroy() {
      const state = this.globalData.soniq
      if (!state) return
      persistLibrary(state)
      saveSettings(state)
      if (state.player) {
        if (state.playback.isPlaying) handoffToBackground(state)
        state.player.release()
      }
      removeMissingTempFiles()
    },
  }),
)

function removeMissingTempFiles() {
  // Best-effort: drop a stale handover file once it has been consumed.
  try {
    removeFile('data://soniq/playback.json.tmp')
  } catch (error) {
    // ignore
  }
}
