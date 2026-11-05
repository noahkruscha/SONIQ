import { create, id } from '@zos/media'
import { emit } from './state'

/**
 * Local playback service. @zos/media on API_LEVEL 3.6 plays MP3 files from the
 * watch data directory; HTTP streaming is not supported, so everything played
 * here is a downloaded, offline file.
 *
 * There is no getCurrentTime()/seek() below API_LEVEL 4.2, so position is
 * derived from the PLAY/PAUSE/PROGRESS events and the wall clock, and the
 * progress bar is display-only.
 */

export function createPlayerService(state) {
  const service = {
    available: false,
    player: null,
    duration: 0,
    basePosition: 0,
    startedAt: 0,
    preparedId: '',
    pendingAutoplay: false,
    volume: state.settings.volume || 70,
  }

  try {
    service.player = create(id.PLAYER)
    service.available = Boolean(service.player)
  } catch (error) {
    service.available = false
  }

  if (!service.available || !service.player) {
    state.playback.error = 'Audio playback is not available on this device.'
    return service
  }

  const player = service.player

  player.addEventListener(player.event.PREPARE, (result) => {
    state.playback.loading = false
    if (result) {
      service.duration = Number(player.getDuration()) || 0
      state.playback.prepared = true
      state.playback.duration = service.duration
      state.playback.error = ''
      service.basePosition = 0
      service.startedAt = 0
      if (service.pendingAutoplay) {
        service.pendingAutoplay = false
        player.start()
      }
      emit(state, 'player', state.playback)
      emit(state, 'track', state.current)
    } else {
      state.playback.prepared = false
      state.playback.error = 'Cannot play this file. It may be corrupted or missing.'
      state.playback.isPlaying = false
      emit(state, 'player', state.playback)
      emit(state, 'error', state.playback.error)
    }
  })

  player.addEventListener(player.event.PLAY, () => {
    state.playback.isPlaying = true
    state.playback.loading = false
    service.startedAt = Date.now()
    emit(state, 'player', state.playback)
  })

  player.addEventListener(player.event.PAUSE, () => {
    // Capture the elapsed position before the state flips to paused.
    if (state.playback.isPlaying) service.basePosition = service.getPosition()
    service.startedAt = 0
    state.playback.isPlaying = false
    state.playback.position = service.basePosition
    emit(state, 'player', state.playback)
  })

  player.addEventListener(player.event.STOP, () => {
    service.startedAt = 0
    state.playback.isPlaying = false
    emit(state, 'player', state.playback)
  })

  player.addEventListener(player.event.COMPLETE, () => {
    service.basePosition = service.duration
    service.startedAt = 0
    state.playback.isPlaying = false
    state.playback.position = service.duration
    emit(state, 'player', state.playback)
    emit(state, 'track-complete', state.current)
    service.next()
  })

  player.addEventListener(player.event.PROGRESS, () => {
    if (!state.playback.isPlaying) return
    state.playback.position = service.getPosition()
    emit(state, 'progress', state.playback.position)
  })

  service.getPosition = function getPosition() {
    if (!state.playback.isPlaying || !service.startedAt) {
      return Math.max(0, service.basePosition)
    }
    const elapsed = (Date.now() - service.startedAt) / 1000
    const total = service.duration || state.playback.duration || 0
    const position = service.basePosition + elapsed
    return total > 0 ? Math.min(total, position) : position
  }

  service.applyVolume = function applyVolume(value) {
    const volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
    try {
      player.setVolume(volume)
      service.volume = volume
      state.settings.volume = volume
      emit(state, 'volume', volume)
      return true
    } catch (error) {
      return false
    }
  }

  service.getVolume = function getVolume() {
    try {
      const current = Number(player.getVolume())
      if (Number.isFinite(current)) return current
    } catch (error) {
      // fall through
    }
    return service.volume
  }

  service.loadTrack = function loadTrack(track, options = {}) {
    if (!track) return false
    if (track.source === 'spotify' || !track.file) {
      state.playback.error = 'Spotify tracks play on your Spotify device, not on the watch.'
      emit(state, 'error', state.playback.error)
      return false
    }
    const autoplay = options.autoplay !== false
    const wasActive = state.playback.isPlaying || state.playback.loading
    state.current = track
    state.playback.source = 'local'
    state.playback.loading = true
    state.playback.isPlaying = false
    state.playback.position = 0
    state.playback.duration = track.duration || 0
    state.playback.error = ''
    state.playback.prepared = false
    state.settings.lastTrackId = track.id
    service.duration = 0
    service.basePosition = 0
    service.startedAt = 0
    service.pendingAutoplay = autoplay
    service.preparedId = track.id

    if (wasActive) {
      try {
        player.stop()
      } catch (error) {
        // ignore
      }
    }

    try {
      player.setSource(player.source.FILE, { file: track.file })
      player.prepare()
    } catch (error) {
      state.playback.loading = false
      state.playback.prepared = false
      state.playback.error = 'Cannot open the audio file.'
      emit(state, 'error', state.playback.error)
      return false
    }

    emit(state, 'track', track)
    emit(state, 'player', state.playback)
    return true
  }

  service.play = function play() {
    if (state.playback.loading) return
    if (!state.current) return
    if (state.playback.source === 'spotify') return
    try {
      if (state.playback.prepared || service.preparedId === state.current.id) {
        player.resume()
      } else {
        service.loadTrack(state.current, { autoplay: true })
      }
    } catch (error) {
      state.playback.error = 'Playback failed.'
      emit(state, 'error', state.playback.error)
    }
  }

  service.pause = function pause() {
    if (!state.playback.isPlaying) return
    const position = service.getPosition()
    service.basePosition = position
    state.playback.position = position
    try {
      player.pause()
    } catch (error) {
      // ignore
    }
    state.playback.isPlaying = false
    service.startedAt = 0
    emit(state, 'player', state.playback)
  }

  service.toggle = function toggle() {
    if (state.playback.isPlaying) service.pause()
    else service.play()
  }

  service.stop = function stop() {
    try {
      player.stop()
    } catch (error) {
      // ignore
    }
    service.basePosition = 0
    service.startedAt = 0
    state.playback.isPlaying = false
    state.playback.prepared = false
    state.playback.position = 0
    emit(state, 'player', state.playback)
  }

  service.setQueue = function setQueue(tracks, startIndex = 0, options = {}) {
    const local = (tracks || []).filter((t) => t && t.source !== 'spotify' && t.file)
    state.queue = local
    state.queueIndex = local.length ? Math.max(0, Math.min(startIndex, local.length - 1)) : -1
    if (state.queueIndex >= 0 && options.play !== false) {
      service.loadTrack(local[state.queueIndex], { autoplay: options.autoplay !== false })
    }
    return local.length
  }

  service.playFromList = function playFromList(tracks, trackId) {
    const index = (tracks || []).findIndex((t) => t.id === trackId)
    return service.setQueue(tracks, index < 0 ? 0 : index, { play: true })
  }

  service.next = function next() {
    const queue = state.queue || []
    if (!queue.length) {
      service.stop()
      return false
    }
    const nextIndex = state.queueIndex + 1
    if (nextIndex >= queue.length) {
      // End of the local queue: stop instead of looping the last track forever.
      service.stop()
      return false
    }
    state.queueIndex = nextIndex
    const track = queue[state.queueIndex]
    if (!track) return false
    state.playback.source = 'local'
    return service.loadTrack(track, { autoplay: true })
  }

  service.previous = function previous() {
    const queue = state.queue || []
    if (!queue.length) return false
    const current = queue[state.queueIndex]
    if (service.getPosition() > 4) {
      // Restart current track when it has been playing for a while.
      return service.loadTrack(current, { autoplay: true })
    }
    const prevIndex = state.queueIndex - 1
    if (prevIndex < 0) return service.loadTrack(current, { autoplay: true })
    state.queueIndex = prevIndex
    const track = queue[state.queueIndex]
    if (!track) return false
    return service.loadTrack(track, { autoplay: true })
  }

  service.release = function release() {
    try {
      player.stop()
    } catch (error) {
      // ignore
    }
  }

  service.load = service.loadTrack

  const initialVolume = state.settings.volume
  if (typeof initialVolume === 'number') {
    try {
      player.setVolume(initialVolume)
    } catch (error) {
      // ignore
    }
  }

  return service
}
