import {
  ARTWORK_DIR,
  DATA_ROOT,
  LIBRARY_PATH,
  MUSIC_DIR,
} from '../shared/constants'
import { isActive } from '../shared/download-state'
import { emit } from './state'
import * as core from './library-core'
import {
  ensureDir,
  exists,
  fileSize,
  listFiles,
  readJSON,
  removeFile,
  writeJSONAtomic,
} from './persist'

/**
 * Offline library service. Everything here is local to the watch; nothing in
 * this module talks to Spotify or the network.
 */

export function initLibrary(state) {
  ensureDir(DATA_ROOT)
  ensureDir(MUSIC_DIR)
  ensureDir(ARTWORK_DIR)

  const raw = readJSON(LIBRARY_PATH, null)
  const base = core.normalizeLibrary(raw)
  const { library, missing } = core.pruneMissing(base, (file) => exists(file))
  state.library = library
  if (!raw || missing.length) persistLibrary(state)
  return { library, missing }
}

export function persistLibrary(state) {
  return writeJSONAtomic(LIBRARY_PATH, state.library, `${LIBRARY_PATH}.tmp`)
}

export function getItem(state, trackId) {
  return core.findItem(state.library, trackId)
}

export function hasTrack(state, trackId) {
  return Boolean(getItem(state, trackId))
}

export function addDownloaded(state, track, { file, size }) {
  const result = core.addItem(state.library, {
    ...track,
    file,
    size: size || fileSize(file),
    addedAt: Date.now(),
  })
  state.library = result.library
  persistLibrary(state)
  emit(state, 'library', state.library)
  emit(state, 'downloads', state.downloads)
  return result
}

export function updateArtwork(state, trackId, artworkPath) {
  const item = getItem(state, trackId)
  if (!item) return
  item.artworkPath = artworkPath
  if (state.current && state.current.id === trackId) state.current.artworkPath = artworkPath
  persistLibrary(state)
  emit(state, 'artwork', { trackId, artworkPath })
}

export function removeDownloaded(state, trackId) {
  const item = getItem(state, trackId)
  if (!item) return false
  if (state.current && state.current.id === trackId && state.player) {
    state.player.stop()
    state.current = null
  }
  removeFile(item.file)
  if (item.artworkPath) removeFile(item.artworkPath)
  state.library = core.removeItem(state.library, trackId)
  persistLibrary(state)
  emit(state, 'library', state.library)
  return true
}

export function isLiked(state, trackId) {
  return core.isLiked(state.library, trackId)
}

export function toggleLocalLike(state, trackId) {
  const liked = !core.isLiked(state.library, trackId)
  state.library = core.setLiked(state.library, trackId, liked)
  persistLibrary(state)
  emit(state, 'likes', { trackId, liked })
  return liked
}

export function stats(state) {
  return {
    count: state.library.items.length,
    bytes: core.libraryBytes(state.library),
  }
}

export function sorted(state) {
  return core.sortedItems(state.library)
}

/** Deletes orphaned audio + leftover download files. Returns count removed. */
export function cleanupFiles(state) {
  let removed = 0
  const audioNames = listFiles(MUSIC_DIR)
  const orphans = core.orphanAudioFiles(state.library, audioNames)
  for (const name of orphans) {
    if (removeFile(`${MUSIC_DIR}/${name}`)) removed += 1
  }
  // Interrupted transfers can leave partial files behind. Never touch them
  // while a download is active: the incoming file may still be writing.
  const active = Object.keys(state.downloads || {}).some((id) => isActive(state.downloads[id]))
  if (!active) {
    const downloadNames = listFiles('data://download')
    for (const name of downloadNames) {
      if (name.indexOf('soniq-') === 0 || name.indexOf('artwork-') === 0) {
        if (removeFile(`data://download/${name}`)) removed += 1
      }
    }
  }
  if (removed) emit(state, 'storage', stats(state))
  return removed
}

export function totalBytesOnDisk(state) {
  let total = 0
  for (const item of state.library.items) {
    total += fileSize(item.file)
  }
  return total
}
