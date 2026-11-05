import { AUDIO_MAX_BYTES, AUDIO_MIN_BYTES, PROVIDER } from '../constants.js'
import { estimateBitrateKbps, isTargetBitrate, parseLength } from '../validate.js'
import { makeTrackId } from '../tracks.js'

/**
 * Internet Archive provider (no API key). Only items that publish an explicit
 * Creative Commons or public-domain licence are surfaced, so every downloadable
 * file is an authorised copy.
 */

const SEARCH_HOST = 'https://archive.org/advancedsearch.php'
const METADATA_HOST = 'https://archive.org/metadata/'
const DOWNLOAD_HOST = 'https://archive.org/download/'

export function buildSearchUrl(query, rows = 8) {
  const q = `${String(query || '').trim()} AND mediatype:(audio)`
  const fields = ['identifier', 'title', 'creator', 'licenseurl', 'downloads']
    .map((f) => `fl%5B%5D=${f}`)
    .join('&')
  return `${SEARCH_HOST}?q=${encodeURIComponent(q)}&${fields}&rows=${rows}&page=1&output=json`
}

export function parseSearch(json) {
  const docs = json && json.response && Array.isArray(json.response.docs) ? json.response.docs : []
  return docs
    .map((doc) => ({
      identifier: doc.identifier,
      title: firstString(doc.title) || doc.identifier,
      creator: firstString(doc.creator) || 'Internet Archive',
      licenseUrl: firstString(doc.licenseurl),
    }))
    .filter((item) => item.identifier)
}

export function isAuthorizedLicense(licenseUrl) {
  const url = String(licenseUrl || '').toLowerCase()
  if (!url) return false
  return url.indexOf('creativecommons.org') !== -1 || url.indexOf('publicdomain') !== -1
}

export function pickAudioFile(files) {
  const candidates = []
  for (const file of files || []) {
    const name = String(file.name || '')
    const lower = name.toLowerCase()
    const format = String(file.format || '').toLowerCase()
    if (!lower.endsWith('.mp3')) continue
    if (format.indexOf('mp3') === -1 && format.indexOf('mpeg') === -1) continue
    const size = Number(file.size) || 0
    if (size < AUDIO_MIN_BYTES || size > AUDIO_MAX_BYTES) continue
    const duration = parseLength(file.length)
    let bitrate = 0
    if (duration > 0) {
      bitrate = estimateBitrateKbps(size, duration)
      if (!isTargetBitrate(bitrate)) continue
    } else if (size > 6 * 1024 * 1024) {
      // Without a duration we cannot verify quality; reject large unknowns.
      continue
    }
    const score = duration > 0 ? Math.abs(bitrate - 144) : 99
    candidates.push({ file, name, size, duration, bitrate, score })
  }
  candidates.sort((a, b) => a.score - b.score || a.size - b.size)
  return candidates.length ? candidates[0] : null
}

export function buildDownloadUrl(identifier, fileName) {
  const safeId = String(identifier || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  const safeName = String(fileName || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${DOWNLOAD_HOST}${safeId}/${safeName}`
}

export function buildMetadataUrl(identifier) {
  return `${METADATA_HOST}${encodeURIComponent(String(identifier || ''))}`
}

export function artworkUrlFor(identifier) {
  return `https://archive.org/services/img/${encodeURIComponent(String(identifier || ''))}`
}

export function mapArchiveTrack(item, fileInfo, metadata) {
  const meta = (metadata && metadata.metadata) || {}
  const title =
    firstString(fileInfo.file.title) ||
    firstString(meta.title) ||
    item.title ||
    item.identifier
  const artist = firstString(meta.creator) || item.creator || 'Internet Archive'
  const album = firstString(meta.album) || firstString(meta.title) || ''
  const license = firstString(meta.licenseurl) || item.licenseUrl || ''
  return {
    id: makeTrackId('arc', `${item.identifier}/${fileInfo.name}`),
    title,
    artist,
    album,
    duration: fileInfo.duration || parseLength(fileInfo.file.length),
    provider: PROVIDER.ARCHIVE,
    audioUrl: buildDownloadUrl(item.identifier, fileInfo.name),
    artworkUrl: artworkUrlFor(item.identifier),
    license,
    size: fileInfo.size,
  }
}

function firstString(value) {
  if (Array.isArray(value)) {
    const found = value.find((v) => typeof v === 'string' && v.trim())
    return found ? String(found) : ''
  }
  return value == null ? '' : String(value)
}
