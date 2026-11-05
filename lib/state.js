import { EventBus } from '@zos/utils'
import { SETTINGS_PATH, PROVIDER } from '../shared/constants'
import { readJSON, writeJSON } from './persist'

/**
 * One global state object lives on the app instance (globalData) because each
 * Zepp OS page is a separate bundle: module-level singletons would be
 * re-created per page, while the media player must survive navigation.
 */

export function defaultSettings() {
  return {
    provider: PROVIDER.ARCHIVE,
    jamendoClientId: '',
    volume: 70,
    lastTrackId: '',
    lastSpotifyDeviceId: '',
    backgroundPlayback: true,
  }
}

export function createState() {
  return {
    bus: new EventBus(),
    library: { version: 1, items: [], likedIds: [], updatedAt: 0 },
    settings: defaultSettings(),
    demo: false,

    current: null,
    queue: [],
    queueIndex: -1,
    playback: {
      source: 'local',
      isPlaying: false,
      loading: false,
      position: 0,
      duration: 0,
      error: '',
      prepared: false,
    },

    spotify: {
      authenticated: false,
      premium: false,
      user: '',
      country: '',
      playback: null,
      playlists: [],
      playlistsLoaded: false,
      playlistsError: '',
      devices: [],
      devicesLoaded: false,
      devicesError: '',
      savedIds: {},
      lastSync: 0,
    },

    downloads: {},
    artworkPending: {},

    ui: {
      searchQuery: '',
      searchProvider: PROVIDER.ARCHIVE,
      searchResults: [],
      searchStatus: 'idle',
      searchError: '',
      searchCachedFor: '',
      resultsPage: null,
      homeScroll: 0,
      toast: '',
    },

    system: {
      disk: null,
      diskUpdatedAt: 0,
    },

    player: null,
    downloadsMgr: null,
    app: null,
  }
}

export function loadSettings() {
  const saved = readJSON(SETTINGS_PATH, null)
  const settings = { ...defaultSettings(), ...(saved && typeof saved === 'object' ? saved : {}) }
  if (!settings.provider) settings.provider = PROVIDER.ARCHIVE
  return settings
}

export function saveSettings(state) {
  if (!state) return
  writeJSON(SETTINGS_PATH, state.settings)
}

export function getState() {
  try {
    const app = getApp()
    const globalData = app && app._options && app._options.globalData
    return globalData ? globalData.soniq : null
  } catch (error) {
    return null
  }
}

export function emit(state, event, payload) {
  if (state && state.bus) state.bus.emit(event, payload)
}
