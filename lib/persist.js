import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  readdirSync,
  openSync,
  readSync,
  closeSync,
  O_RDONLY,
} from '@zos/fs'
import { safeJsonParse } from '../shared/validate'

/**
 * Small synchronous JSON/file helpers on top of @zos/fs. Files live in the
 * mini program data directory (data://) and survive app restarts.
 */

export function ensureDir(path) {
  try {
    mkdirSync({ path })
  } catch (error) {
    // Already exists or a parent is missing - callers handle missing files.
  }
}

export function readJSON(path, fallback) {
  try {
    const raw = readFileSync({ path, options: { encoding: 'utf8' } })
    if (typeof raw !== 'string' || !raw.length) return fallback
    const parsed = safeJsonParse(raw, undefined)
    return parsed === undefined ? fallback : parsed
  } catch (error) {
    return fallback
  }
}

export function writeJSON(path, value) {
  try {
    const data = JSON.stringify(value)
    writeFileSync({ path, data, options: { encoding: 'utf8' } })
    return true
  } catch (error) {
    return false
  }
}

/** Write + rename so a crash cannot leave a half-written library file. */
export function writeJSONAtomic(path, value, tmpPath) {
  try {
    const data = JSON.stringify(value)
    const tmp = tmpPath || `${path}.tmp`
    writeFileSync({ path: tmp, data, options: { encoding: 'utf8' } })
    const result = renameSync({ oldPath: tmp, newPath: path })
    if (result !== 0) {
      writeFileSync({ path, data, options: { encoding: 'utf8' } })
      try {
        rmSync({ path: tmp })
      } catch (error) {
        // ignore
      }
    }
    return true
  } catch (error) {
    return false
  }
}

export function fileStat(path) {
  try {
    return statSync({ path }) || null
  } catch (error) {
    return null
  }
}

export function fileSize(path) {
  const stat = fileStat(path)
  return stat ? Number(stat.size) || 0 : 0
}

export function exists(path) {
  return Boolean(fileStat(path))
}

export function removeFile(path) {
  try {
    return rmSync({ path }) === 0
  } catch (error) {
    return false
  }
}

export function listFiles(dir) {
  try {
    const result = readdirSync({ path: dir })
    return Array.isArray(result) ? result : []
  } catch (error) {
    return []
  }
}

/** Reads the first `count` bytes of a file (used to verify MP3/JPEG headers). */
export function readHead(path, count = 12) {
  let fd = null
  try {
    fd = openSync({ path, flag: O_RDONLY })
    if (!fd || fd < 0) return null
    const buffer = new ArrayBuffer(count)
    const read = readSync({ fd, buffer, options: { offset: 0, length: count, position: 0 } })
    const bytes = new Uint8Array(buffer)
    return read > 0 ? bytes.slice(0, read) : bytes
  } catch (error) {
    return null
  } finally {
    if (fd && fd >= 0) {
      try {
        closeSync({ fd })
      } catch (error) {
        // ignore
      }
    }
  }
}

export function moveFile(oldPath, newPath) {
  try {
    return renameSync({ oldPath, newPath }) === 0
  } catch (error) {
    return false
  }
}
