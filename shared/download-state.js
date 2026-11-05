import { DOWNLOAD_PHASE } from './constants.js'
import { clamp } from './format.js'

export function createDownloadRecord(track) {
  return {
    trackId: track && track.id ? track.id : '',
    phase: DOWNLOAD_PHASE.IDLE,
    progress: 0,
    loaded: 0,
    total: 0,
    error: '',
    attempts: 0,
    startedAt: 0,
    title: (track && track.title) || '',
    artist: (track && track.artist) || '',
  }
}

export function isActive(record) {
  if (!record) return false
  return (
    record.phase === DOWNLOAD_PHASE.CHECKING ||
    record.phase === DOWNLOAD_PHASE.DOWNLOADING ||
    record.phase === DOWNLOAD_PHASE.TRANSFERRING ||
    record.phase === DOWNLOAD_PHASE.SAVING
  )
}

export function startRecord(record) {
  record.phase = DOWNLOAD_PHASE.CHECKING
  record.progress = 0
  record.loaded = 0
  record.error = ''
  record.startedAt = Date.now()
  record.attempts += 1
  return record
}

export function applyProgress(record, event) {
  const phase =
    event && event.phase === 'transfer'
      ? DOWNLOAD_PHASE.TRANSFERRING
      : DOWNLOAD_PHASE.DOWNLOADING
  record.phase = phase
  record.progress = clamp(Number(event && event.progress) || 0, 0, 100)
  record.loaded = Math.max(0, Number(event && event.loaded) || 0)
  record.total = Math.max(0, Number(event && event.total) || 0)
  return record
}

export function applyError(record, message) {
  record.phase = DOWNLOAD_PHASE.ERROR
  record.error = String(message || 'Download failed')
  return record
}

export function applyDone(record) {
  record.phase = DOWNLOAD_PHASE.DONE
  record.progress = 100
  record.error = ''
  return record
}

export function applyCanceled(record) {
  record.phase = DOWNLOAD_PHASE.CANCELED
  record.progress = 0
  return record
}

export function statusLabel(record) {
  if (!record) return ''
  switch (record.phase) {
    case DOWNLOAD_PHASE.CHECKING:
      return 'Checking storage\u2026'
    case DOWNLOAD_PHASE.DOWNLOADING:
      return `Downloading ${record.progress}%`
    case DOWNLOAD_PHASE.TRANSFERRING:
      return `Sending to watch ${record.progress}%`
    case DOWNLOAD_PHASE.SAVING:
      return 'Saving\u2026'
    case DOWNLOAD_PHASE.DONE:
      return 'Downloaded'
    case DOWNLOAD_PHASE.CANCELED:
      return 'Canceled'
    case DOWNLOAD_PHASE.ERROR:
      return record.error || 'Download failed'
    default:
      return ''
  }
}
