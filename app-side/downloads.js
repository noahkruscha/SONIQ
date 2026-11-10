import { AUDIO_MAX_BYTES, AUDIO_MIN_BYTES, SIDE_CALL } from '../shared/constants'
import { isAllowedArtworkUrl, isAllowedAudioUrl, isUserAudioUrl, sanitizeFileName } from '../shared/validate'
import { KEYS, fail } from './keys'

/**
 * Phone-side download + BLE transfer. network.downloader streams the file to
 * the phone's data directory, then transferFile pushes it to the watch. The
 * watch re-validates size and the MP3 header before saving it to the library.
 */
export function createDownloads(ctx) {
  const tasks = new Map()

  function sendProgress(trackId, phase, event, force) {
    const entry = tasks.get(trackId)
    const now = Date.now()
    if (entry && !force && now - entry.lastSent < 600 && Number(event.progress) < 100) return
    if (entry) entry.lastSent = now
    ctx.call({
      type: SIDE_CALL.DOWNLOAD_PROGRESS,
      trackId,
      phase,
      progress: Math.max(0, Math.min(100, Math.round(Number(event.progress) || 0))),
      loaded: Number(event.loaded) || 0,
      total: Number(event.total) || 0,
    })
  }

  function sendError(trackId, message) {
    tasks.delete(trackId)
    ctx.call({ type: SIDE_CALL.DOWNLOAD_ERROR, trackId, message: String(message || 'download failed') })
  }

  function start(track) {
    const trackId = track && track.id
    if (!trackId) throw fail('download_failed', 'missing track id')
    const allowed = track.userLink ? isUserAudioUrl(track.audioUrl) : isAllowedAudioUrl(track.audioUrl)
    if (!allowed) throw fail('invalid_audio', 'blocked source')

    cancel(trackId)

    const filePath = `data://download/soniq-${sanitizeFileName(trackId)}.mp3`
    const entry = {
      canceled: false,
      lastSent: 0,
      total: 0,
      task: null,
      transfer: null,
    }
    tasks.set(trackId, entry)

    let task
    try {
      task = ctx.download(track.audioUrl, { filePath, timeout: 120000 })
    } catch (error) {
      tasks.delete(trackId)
      throw fail('download_failed', error.message)
    }
    entry.task = task

    task.onProgress = (event) => {
      if (entry.canceled) return
      entry.total = Number(event.total) || entry.total
      sendProgress(trackId, 'download', event)
    }

    task.onFail = (event) => {
      if (entry.canceled) return
      sendError(trackId, (event && event.message) || 'the download failed')
    }

    task.onSuccess = (event) => {
      if (entry.canceled) return
      const status = Number(event && event.statusCode) || 0
      if (status && (status < 200 || status >= 300)) {
        sendError(trackId, `server returned HTTP ${status}`)
        return
      }
      if (entry.total && (entry.total < AUDIO_MIN_BYTES || entry.total > AUDIO_MAX_BYTES)) {
        sendError(trackId, 'the file is too small or too large to be a 128 kbps MP3')
        return
      }
      try {
        const file = ctx.sendFile(filePath, { kind: 'audio', trackId, track })
        entry.transfer = file
        file.on('progress', (progressEvent) => {
          if (entry.canceled) return
          const data = (progressEvent && progressEvent.data) || {}
          const total = Number(data.fileSize) || entry.total
          const loaded = Number(data.loadedSize) || 0
          sendProgress(
            trackId,
            'transfer',
            {
              progress: total ? Math.round((loaded / total) * 100) : 0,
              loaded,
              total,
            },
            true,
          )
        })
        file.on('change', (changeEvent) => {
          const state = changeEvent && changeEvent.data && changeEvent.data.readyState
          if (state === 'transferred') {
            tasks.delete(trackId)
          } else if (state === 'error') {
            sendError(trackId, 'the transfer to the watch failed')
          }
        })
      } catch (error) {
        sendError(trackId, error.message)
      }
    }

    task.onComplete = () => {}

    return { ok: true, started: true }
  }

  function cancel(trackId) {
    const entry = tasks.get(trackId)
    if (!entry) return { ok: true }
    entry.canceled = true
    try {
      if (entry.task && entry.task.cancel) entry.task.cancel()
    } catch (error) {
      // ignore
    }
    try {
      if (entry.transfer && entry.transfer.cancel) entry.transfer.cancel()
    } catch (error) {
      // ignore
    }
    tasks.delete(trackId)
    return { ok: true }
  }

  function artwork(trackId, url) {
    if (!isAllowedArtworkUrl(url)) throw fail('invalid_artwork', 'blocked host')
    const filePath = `data://download/artwork-${sanitizeFileName(trackId)}`
    return new Promise((resolve) => {
      let task
      try {
        task = ctx.download(url, { filePath, timeout: 30000 })
      } catch (error) {
        resolve({ ok: false })
        return
      }
      task.onSuccess = (event) => {
        if (!event || (Number(event.statusCode) || 0) >= 300) {
          resolve({ ok: false })
          return
        }
        try {
          const file = ctx.sendFile(filePath, { kind: 'artwork', trackId })
          file.on('change', (changeEvent) => {
            const state = changeEvent && changeEvent.data && changeEvent.data.readyState
            if (state === 'error') resolve({ ok: false })
          })
          resolve({ ok: true })
        } catch (error) {
          resolve({ ok: false })
        }
      }
      task.onFail = () => resolve({ ok: false })
    })
  }

  function pickup() {
    const url = String(ctx.settings.getItem(KEYS.pendingAudioUrl) || '').trim()
    if (!url) return { url: '' }
    ctx.settings.setItem(KEYS.pendingAudioUrl, '')
    return { url }
  }

  return { start, cancel, artwork, pickup }
}
