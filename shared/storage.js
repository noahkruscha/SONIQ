import { STORAGE_RESERVE_BYTES, TARGET_KBPS } from './constants.js'

/** Normalises the object returned by getDiskInfo() from @zos/device. */
export function summarizeDisk(info) {
  const total = Math.max(0, Number(info && info.total) || 0)
  const free = Math.max(0, Number(info && info.free) || 0)
  const used = Math.max(0, total - free)
  return {
    total,
    free,
    used,
    freePercent: total > 0 ? Math.round((free / total) * 100) : 0,
    usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
    app: Math.max(0, Number(info && info.app) || 0),
    music: Math.max(0, Number(info && info.music) || 0),
    system: Math.max(0, Number(info && info.system) || 0),
    watchface: Math.max(0, Number(info && info.watchface) || 0),
  }
}

/** Bytes needed for a track of `seconds` at the target quality. */
export function estimateDownloadBytes(seconds, kbps = TARGET_KBPS) {
  const duration = Math.max(1, Number(seconds) || 0)
  return Math.ceil((duration * kbps * 1000) / 8)
}

export function canFit(freeBytes, needBytes, reserveBytes = STORAGE_RESERVE_BYTES) {
  const free = Number(freeBytes) || 0
  const need = Number(needBytes) || 0
  return free - need >= reserveBytes
}

export function downloadBudget(freeBytes) {
  const free = Math.max(0, Number(freeBytes) || 0)
  return Math.max(0, free - STORAGE_RESERVE_BYTES)
}

export function storageWarning(freeBytes, needBytes) {
  const free = Number(freeBytes) || 0
  const need = Number(needBytes) || 0
  if (canFit(free, need)) return ''
  return `Not enough storage: ${Math.round(need / 1024)} K needed, ${Math.round(
    Math.max(0, free - STORAGE_RESERVE_BYTES) / 1024,
  )} K available.`
}
