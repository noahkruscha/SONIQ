import { start, stop, getAllAppServices } from '@zos/app-service'
import { queryPermission, requestPermission } from '@zos/app'
import { PLAYBACK_STATE_PATH } from '../shared/constants'
import { readJSON, removeFile, writeJSON } from './persist'

/**
 * Background audio.
 *
 * Zepp OS 3.x cannot keep a page alive when the user leaves the app, but an
 * "App Service" may keep running with `device:os.bg_service`. The player is
 * therefore handed over: the app writes the current track, starts the service,
 * and the service continues playback from the beginning of that file (seek is
 * not available below API_LEVEL 4.2). When the app reopens it stops the service
 * and takes the player back.
 */

export const PLAYBACK_SERVICE = 'app-service/playback'
const BG_PERMISSION = 'device:os.bg_service'

export function isServiceRunning() {
  try {
    const services = getAllAppServices()
    return Array.isArray(services) && services.indexOf(PLAYBACK_SERVICE) !== -1
  } catch (error) {
    return false
  }
}

export function stopBackgroundService() {
  try {
    stop({ file: PLAYBACK_SERVICE, complete_func: () => {} })
  } catch (error) {
    // Service not running / not permitted.
  }
}

export function hasBackgroundPermission() {
  try {
    const result = queryPermission({ permissions: [BG_PERMISSION] })
    return Array.isArray(result) && result[0] === 2
  } catch (error) {
    return false
  }
}

export function requestBackgroundPermission(callback) {
  const done = typeof callback === 'function' ? callback : () => {}
  if (hasBackgroundPermission()) {
    done(true)
    return
  }
  try {
    // result: 0 = dialog shown (answer arrives in callback), 1 = cannot ask,
    // 2 = already granted.
    const result = requestPermission({
      permissions: [BG_PERMISSION],
      callback: (results) => done(Array.isArray(results) && results[0] === 2),
    })
    if (result === 2) done(true)
    else if (result === 1) done(false)
  } catch (error) {
    done(false)
  }
}

/** Writes the handover state and starts the playback service. */
export function handoffToBackground(state) {
  if (!state || !state.settings.backgroundPlayback) return false
  const current = state.current
  if (!current || current.source === 'spotify' || !current.file) return false
  if (!state.playback.isPlaying) return false
  if (!hasBackgroundPermission()) return false

  const position = state.player ? Math.round(state.player.getPosition()) : 0
  writeJSON(PLAYBACK_STATE_PATH, {
    trackId: current.id,
    title: current.title,
    artist: current.artist,
    file: current.file,
    position,
    duration: state.playback.duration || current.duration || 0,
    artworkPath: current.artworkPath || '',
    savedAt: Date.now(),
  })

  try {
    const result = start({ file: PLAYBACK_SERVICE, complete_func: () => {} })
    return result === 0
  } catch (error) {
    return false
  }
}

export function readHandoffState() {
  return readJSON(PLAYBACK_STATE_PATH, null)
}

export function clearHandoffState() {
  removeFile(PLAYBACK_STATE_PATH)
}
