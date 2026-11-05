import { create, id } from '@zos/media'
import { exit } from '@zos/app-service'
import { PLAYBACK_STATE_PATH } from '../shared/constants'
import { readJSON } from '../lib/persist'

/**
 * Continuous-playback App Service. The device app hands over the current track
 * when the user leaves it while music is playing. Zepp OS app services have no
 * UI and no timers, so this service only reacts to Player events and exits when
 * the track completes or playback is stopped.
 *
 * There is no seek below API_LEVEL 4.2, so playback resumes from the start of
 * the handed-over file; the app shows the same behaviour when it reopens.
 */

AppService({
  onInit() {
    const saved = readJSON(PLAYBACK_STATE_PATH, null)
    if (!saved || !saved.file) {
      exit()
      return
    }

    let player = null
    try {
      player = create(id.PLAYER)
    } catch (error) {
      exit()
      return
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      try {
        player.stop()
      } catch (error) {
        // ignore
      }
      exit()
    }

    player.addEventListener(player.event.PREPARE, (result) => {
      if (!result) {
        finish()
        return
      }
      try {
        player.start()
      } catch (error) {
        finish()
      }
    })

    player.addEventListener(player.event.COMPLETE, finish)
    player.addEventListener(player.event.STOP, finish)

    try {
      player.setSource(player.source.FILE, { file: saved.file })
      player.prepare()
    } catch (error) {
      finish()
    }
  },

  onDestroy() {
    // The Player is released by the system when the service exits.
  },
})
