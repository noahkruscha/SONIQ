import { getDiskInfo } from '@zos/device'
import { showToast } from '@zos/interaction'
import {
  ARTWORK_DIR,
  DOWNLOAD_PHASE,
  MUSIC_DIR,
  SIDE_CALL,
  STORAGE_RESERVE_BYTES,
} from '../shared/constants'
import {
  applyCanceled,
  applyDone,
  applyError,
  applyProgress,
  createDownloadRecord,
  isActive,
  startRecord,
  statusLabel,
} from '../shared/download-state'
import { formatBytes } from '../shared/format'
import { canFit, estimateDownloadBytes, storageWarning, summarizeDisk } from '../shared/storage'
import { fileNameForTrack, isDownloadable, normalizeTrack } from '../shared/tracks'
import {
  isAcceptableArtworkSize,
  isAcceptableAudioSize,
  isAllowedArtworkUrl,
  isJpegOrPng,
  isMp3Header,
} from '../shared/validate'
import { createBridge } from './api'
import { friendlyError } from './errors'
import { addDownloaded, getItem, hasTrack, updateArtwork } from './library'
import {
  ensureDir,
  exists,
  fileSize,
  moveFile,
  readHead,
  removeFile,
} from './persist'
import { emit } from './state'

/**
 * Download orchestration on the watch:
 * storage check -> phone downloads the file -> phone transfers it over BLE ->
 * header/size validation -> move into data://music -> library entry.
 */
export function createDownloadManager(state, requestFn) {
  const bridge = createBridge(requestFn)
  const manager = {
    bridge,
    pending: {},
  }

  manager.toast = function toast(message) {
    try {
      showToast({ content: String(message).slice(0, 80) })
    } catch (error) {
      // ignore
    }
  }

  manager.refreshDisk = function refreshDisk(callback) {
    try {
      getDiskInfo((info) => {
        state.system.disk = summarizeDisk(info)
        state.system.diskUpdatedAt = Date.now()
        emit(state, 'storage', state.system.disk)
        if (callback) callback(state.system.disk)
      })
    } catch (error) {
      if (callback) callback(state.system.disk)
    }
  }

  manager.record = function record(trackId) {
    return state.downloads[trackId] || null
  }

  manager.ensureRecord = function ensureRecord(track) {
    if (!track || !track.id) return null
    if (!state.downloads[track.id]) {
      state.downloads[track.id] = createDownloadRecord(track)
    }
    return state.downloads[track.id]
  }

  manager.stateFor = function stateFor(track) {
    if (!track) return { phase: DOWNLOAD_PHASE.IDLE, progress: 0, error: '' }
    if (hasTrack(state, track.id)) {
      return { phase: DOWNLOAD_PHASE.DONE, progress: 100, error: '' }
    }
    return state.downloads[track.id] || { phase: DOWNLOAD_PHASE.IDLE, progress: 0, error: '' }
  }

  manager.labelFor = function labelFor(track) {
    return statusLabel(manager.stateFor(track))
  }

  manager.estimatedBytes = function estimatedBytes(track) {
    if (track && track.size) return track.size
    const duration = (track && track.duration) || 0
    if (duration > 0) return estimateDownloadBytes(duration)
    return 4 * 1024 * 1024
  }

  manager.start = function start(track) {
    if (!track) return false
    if (track.source === 'spotify') {
      manager.toast('Spotify tracks cannot be downloaded.')
      return false
    }
    if (!isDownloadable(track)) {
      manager.toast('No downloadable audio for this track.')
      return false
    }
    if (hasTrack(state, track.id)) {
      const rec = manager.ensureRecord(track)
      applyDone(rec)
      manager.toast('Already downloaded.')
      return false
    }
    const existing = manager.record(track.id)
    if (existing && isActive(existing)) return false

    const rec = manager.ensureRecord(track)
    startRecord(rec)
    manager.pending[track.id] = track
    emit(state, 'downloads', state.downloads)
    emit(state, 'download-progress', { track, record: rec })

    manager.refreshDisk((disk) => {
      const need = Math.ceil(manager.estimatedBytes(track) * 1.15)
      const free = disk ? disk.free : 0
      if (!disk || !canFit(free, need, STORAGE_RESERVE_BYTES + 2 * 1024 * 1024)) {
        applyError(rec, storageWarning(free, need))
        emit(state, 'downloads', state.downloads)
        emit(state, 'download-error', { track, message: rec.error })
        manager.toast(`${track.title}: not enough storage on the watch.`)
        return
      }

      bridge
        .downloadStart(track, need)
        .then((result) => {
          if (!rec || rec.phase === DOWNLOAD_PHASE.CANCELED) return
          rec.phase = DOWNLOAD_PHASE.DOWNLOADING
          if (result && result.total) rec.total = Number(result.total) || 0
          emit(state, 'downloads', state.downloads)
        })
        .catch((error) => {
          if (!rec || rec.phase === DOWNLOAD_PHASE.CANCELED) return
          applyError(rec, friendlyError(error, 'Download could not start.'))
          emit(state, 'downloads', state.downloads)
          emit(state, 'download-error', { track, message: rec.error })
          manager.toast(rec.error)
        })
    })
    return true
  }

  manager.retry = function retry(track) {
    const rec = manager.record(track.id)
    if (rec && isActive(rec)) return
    manager.start(track)
  }

  manager.cancel = function cancel(trackOrId) {
    const trackId = typeof trackOrId === 'string' ? trackOrId : trackOrId && trackOrId.id
    if (!trackId) return
    const rec = manager.record(trackId)
    if (rec && !isActive(rec)) return
    if (rec) {
      applyCanceled(rec)
      emit(state, 'downloads', state.downloads)
      emit(state, 'download-canceled', { trackId })
    }
    bridge.downloadCancel(trackId).catch(() => {})
    removeFile(`${MUSIC_DIR}/${fileNameForTrack({ id: trackId })}`)
    manager.toast('Download canceled.')
  }

  manager.onSideCall = function onSideCall(payload) {
    if (!payload || !payload.type) return
    switch (payload.type) {
      case SIDE_CALL.DOWNLOAD_PROGRESS: {
        const rec = manager.record(payload.trackId)
        if (!rec) return
        if (rec.phase === DOWNLOAD_PHASE.CANCELED) return
        applyProgress(rec, payload)
        emit(state, 'downloads', state.downloads)
        emit(state, 'download-progress', { track: manager.pending[payload.trackId], record: rec })
        break
      }
      case SIDE_CALL.DOWNLOAD_ERROR: {
        const rec = manager.record(payload.trackId)
        if (!rec) return
        if (rec.phase === DOWNLOAD_PHASE.CANCELED) return
        applyError(rec, friendlyError(payload.message, 'Download failed.'))
        emit(state, 'downloads', state.downloads)
        emit(state, 'download-error', { trackId: payload.trackId, message: rec.error })
        manager.toast(rec.error)
        break
      }
      case SIDE_CALL.DOWNLOAD_STARTED: {
        const rec = manager.record(payload.trackId)
        if (!rec) return
        rec.phase = DOWNLOAD_PHASE.DOWNLOADING
        if (payload.total) rec.total = Number(payload.total) || 0
        emit(state, 'downloads', state.downloads)
        break
      }
      case SIDE_CALL.SPOTIFY_CHANGED: {
        emit(state, 'spotify', payload)
        break
      }
      default:
        break
    }
  }

  manager.handleFile = function handleFile(file) {
    if (!file || !file.params) return
    const params = file.params

    const consume = () => {
      if (params.kind === 'audio') {
        handleAudioFile(file, params)
      } else if (params.kind === 'artwork') {
        handleArtworkFile(file, params)
      } else if (file.filePath) {
        removeFile(file.filePath)
      }
    }

    const failTransfer = () => {
      if (params.kind === 'artwork') {
        delete state.artworkPending[params.trackId]
        return
      }
      const rec = manager.record(params.trackId)
      if (rec && isActive(rec)) {
        applyError(rec, 'The transfer from the phone failed.')
        emit(state, 'downloads', state.downloads)
        emit(state, 'download-error', { trackId: params.trackId, message: rec.error })
        manager.toast(rec.error)
      }
    }

    // onReceivedFile fires when the transfer starts, so the file only becomes
    // readable once readyState reaches 'transferred'.
    if (file.readyState === 'transferred') {
      consume()
      return
    }
    if (file.readyState === 'error' || file.readyState === 'canceled') {
      failTransfer()
      return
    }
    try {
      file.on('change', (event) => {
        const ready = event && event.data && event.data.readyState
        if (ready === 'transferred') consume()
        else if (ready === 'error' || ready === 'canceled') failTransfer()
      })
    } catch (error) {
      failTransfer()
    }
  }

  function handleAudioFile(file, params) {
    const raw = params.track || manager.pending[params.trackId] || {}
    const track = normalizeTrack({ ...raw, id: params.trackId || raw.id })
    const rec = manager.ensureRecord(track)
    const size = fileSize(file.filePath)
    const head = readHead(file.filePath, 4)

    if (!track.id || !size || !isAcceptableAudioSize(size) || !isMp3Header(head)) {
      removeFile(file.filePath)
      applyError(rec, 'The downloaded file is not a valid MP3.')
      delete state.downloads[track.id]
      emit(state, 'downloads', state.downloads)
      emit(state, 'download-error', { track, message: rec.error })
      manager.toast('Download failed: not a supported MP3 file.')
      return
    }

    rec.phase = DOWNLOAD_PHASE.SAVING
    emit(state, 'downloads', state.downloads)

    ensureDir(MUSIC_DIR)
    const dest = `${MUSIC_DIR}/${fileNameForTrack(track)}`
    removeFile(dest)
    const moved = moveFile(file.filePath, dest)
    if (!moved) {
      removeFile(file.filePath)
      applyError(rec, 'Could not save the file to watch storage.')
      emit(state, 'downloads', state.downloads)
      emit(state, 'download-error', { track, message: rec.error })
      manager.toast(rec.error)
      return
    }

    addDownloaded(state, track, { file: dest, size })
    applyDone(rec)
    delete manager.pending[track.id]
    emit(state, 'downloads', state.downloads)
    emit(state, 'download-done', { track, size })
    manager.toast(`Downloaded: ${track.title}`)
    manager.refreshDisk()

    if (track.artworkUrl) manager.ensureArtwork({ ...track, artworkPath: '' })
  }

  function handleArtworkFile(file, params) {
    const trackId = params.trackId
    if (!trackId) {
      removeFile(file.filePath)
      return
    }
    delete state.artworkPending[trackId]
    const size = fileSize(file.filePath)
    const head = readHead(file.filePath, 4)
    if (!isAcceptableArtworkSize(size) || !isJpegOrPng(head)) {
      removeFile(file.filePath)
      return
    }
    ensureDir(ARTWORK_DIR)
    const dest = `${ARTWORK_DIR}/${String(trackId).replace(/[^a-z0-9-]/gi, '-')}.jpg`
    removeFile(dest)
    if (moveFile(file.filePath, dest)) {
      updateArtwork(state, trackId, dest)
      emit(state, 'artwork', { trackId, artworkPath: dest })
    } else {
      removeFile(file.filePath)
    }
  }

  manager.ensureArtwork = function ensureArtwork(track) {
    if (!track || !track.id || !track.artworkUrl) return
    if (track.artworkPath && exists(track.artworkPath)) return
    const item = getItem(state, track.id)
    if (item && item.artworkPath && exists(item.artworkPath)) {
      track.artworkPath = item.artworkPath
      return
    }
    if (!isAllowedArtworkUrl(track.artworkUrl)) return
    const pendingAt = state.artworkPending[track.id]
    if (pendingAt && Date.now() - pendingAt < 120000) return
    state.artworkPending[track.id] = Date.now()
    bridge
      .artworkFetch(track.id, track.artworkUrl)
      .then((result) => {
        if (!result || !result.ok) delete state.artworkPending[track.id]
      })
      .catch(() => {
        delete state.artworkPending[track.id]
      })
  }

  manager.statusLabel = statusLabel
  manager.formatBytes = formatBytes

  return manager
}
