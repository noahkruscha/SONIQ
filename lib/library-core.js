import { normalizeTrack } from '../shared/tracks.js'

/**
 * Pure operations on the offline library. The file/fs side lives in
 * lib/library.js; keeping these functions pure makes them testable in Node.
 *
 * Stored item = normalised track + { file, size, addedAt }
 */

export const LIBRARY_VERSION = 1

export function createLibrary() {
  return { version: LIBRARY_VERSION, items: [], likedIds: [], updatedAt: 0 }
}

export function normalizeLibrary(raw) {
  if (!raw || typeof raw !== 'object') return createLibrary()
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item) => item && item.id && item.file)
        .map((item) => ({
          ...normalizeTrack(item),
          file: String(item.file),
          size: Math.max(0, Number(item.size) || 0),
          addedAt: Number(item.addedAt) || 0,
        }))
    : []
  const likedIds = Array.isArray(raw.likedIds) ? raw.likedIds.filter((id) => typeof id === 'string') : []
  return {
    version: LIBRARY_VERSION,
    items: dedupeLibrary(items),
    likedIds: Array.from(new Set(likedIds)),
    updatedAt: Number(raw.updatedAt) || 0,
  }
}

function dedupeLibrary(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function findItem(library, trackId) {
  if (!library || !trackId) return null
  return library.items.find((item) => item.id === trackId) || null
}

/** Adds or replaces an item. Returns { library, added }. */
export function addItem(library, item) {
  const next = cloneLibrary(library)
  const existingIndex = next.items.findIndex((entry) => entry.id === item.id)
  const record = {
    ...normalizeTrack(item),
    file: String(item.file),
    size: Math.max(0, Number(item.size) || 0),
    addedAt: Number(item.addedAt) || Date.now(),
  }
  if (existingIndex >= 0) {
    next.items[existingIndex] = record
    next.updatedAt = Date.now()
    return { library: next, added: false }
  }
  next.items.unshift(record)
  next.updatedAt = Date.now()
  return { library: next, added: true }
}

export function removeItem(library, trackId) {
  const next = cloneLibrary(library)
  next.items = next.items.filter((item) => item.id !== trackId)
  next.likedIds = next.likedIds.filter((id) => id !== trackId)
  next.updatedAt = Date.now()
  return next
}

export function isLiked(library, trackId) {
  return Boolean(library && library.likedIds.indexOf(trackId) !== -1)
}

export function setLiked(library, trackId, liked) {
  const next = cloneLibrary(library)
  const has = next.likedIds.indexOf(trackId) !== -1
  if (liked && !has) next.likedIds.push(trackId)
  if (!liked && has) next.likedIds = next.likedIds.filter((id) => id !== trackId)
  next.updatedAt = Date.now()
  return next
}

export function libraryBytes(library) {
  return (library && library.items ? library.items : []).reduce(
    (sum, item) => sum + (Number(item.size) || 0),
    0,
  )
}

export function sortedItems(library) {
  return (library && library.items ? library.items.slice() : []).sort(
    (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
  )
}

/** Removes entries whose audio file no longer exists. */
export function pruneMissing(library, exists) {
  const next = cloneLibrary(library)
  const missing = []
  next.items = next.items.filter((item) => {
    const present = Boolean(exists(item.file))
    if (!present) missing.push(item.id)
    return present
  })
  if (missing.length) {
    next.likedIds = next.likedIds.filter((id) => missing.indexOf(id) === -1)
    next.updatedAt = Date.now()
  }
  return { library: next, missing }
}

/** Audio files on disk that the library does not reference. */
export function orphanAudioFiles(library, fileNames, prefix = 'soniq-') {
  const referenced = new Set(
    (library && library.items ? library.items : []).map((item) => String(item.file).split('/').pop()),
  )
  return (fileNames || []).filter(
    (name) => name.startsWith(prefix) && !referenced.has(name),
  )
}

export function cloneLibrary(library) {
  const base = normalizeLibrary(library)
  return {
    version: LIBRARY_VERSION,
    items: base.items.map((item) => ({ ...item })),
    likedIds: base.likedIds.slice(),
    updatedAt: base.updatedAt,
  }
}
