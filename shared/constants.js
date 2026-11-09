/**
 * Values shared by the device app, the phone-side service and the unit tests.
 * Keep this file free of Zepp OS imports so it can run under Node.
 */

export const APP_NAME = 'SONIQ'

/** Shown in settings and on the storage screen so an installed build can be identified. */
export const APP_VERSION = '1.0.5'

export const PROVIDER = {
  ARCHIVE: 'archive',
  JAMENDO: 'jamendo',
  SPOTIFY: 'spotify',
}

/** Audio accepted by @zos/media on API_LEVEL 3.6 is MP3 (and OPUS recordings). */
export const AUDIO_EXT = '.mp3'

export const AUDIO_MIN_BYTES = 48 * 1024
export const AUDIO_MAX_BYTES = 12 * 1024 * 1024
export const ARTWORK_MAX_BYTES = 512 * 1024
export const ARTWORK_MIN_BYTES = 512

/** Free bytes kept untouched on the watch before a download is allowed. */
export const STORAGE_RESERVE_BYTES = 8 * 1024 * 1024

/** Quality target for downloads: 128-160 kbps MP3. */
export const TARGET_KBPS = 128
export const MIN_KBPS = 96
export const MAX_KBPS = 200

export const MAX_TRACK_SECONDS = 20 * 60
export const SEARCH_MIN_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 700
export const SEARCH_RESULT_LIMIT = 12
export const PLAYLIST_PAGE_SIZE = 20

/** Spotify Web API polling interval while the player screen is visible. */
export const SPOTIFY_POLL_MS = 12000

export const DATA_ROOT = 'data://soniq'
export const LIBRARY_PATH = 'data://soniq/library.json'
export const SETTINGS_PATH = 'data://soniq/settings.json'
export const PLAYBACK_STATE_PATH = 'data://soniq/playback.json'
export const MUSIC_DIR = 'data://music'
export const ARTWORK_DIR = 'data://artwork'

export const DOWNLOAD_PHASE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  TRANSFERRING: 'transferring',
  SAVING: 'saving',
  DONE: 'done',
  CANCELED: 'canceled',
  ERROR: 'error',
}

export const SIDE_CALL = {
  DOWNLOAD_PROGRESS: 'download.progress',
  DOWNLOAD_ERROR: 'download.error',
  DOWNLOAD_STARTED: 'download.started',
  SPOTIFY_CHANGED: 'spotify.changed',
}
