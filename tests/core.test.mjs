import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBytes, formatTime, percent, truncate } from '../shared/format.js'
import {
  canFit,
  estimateDownloadBytes,
  storageWarning,
  summarizeDisk,
} from '../shared/storage.js'
import {
  estimateBitrateKbps,
  isAcceptableAudioSize,
  isAllowedArtworkUrl,
  isAllowedAudioUrl,
  isJpegOrPng,
  isMp3Header,
  isTargetBitrate,
  isUserAudioUrl,
  parseLength,
  safeJsonParse,
} from '../shared/validate.js'
import { dedupeTracks, fileNameForTrack, makeTrackId, normalizeTrack } from '../shared/tracks.js'
import {
  addItem,
  createLibrary,
  isLiked,
  libraryBytes,
  normalizeLibrary,
  orphanAudioFiles,
  pruneMissing,
  removeItem,
  setLiked,
} from '../lib/library-core.js'
import {
  applyCanceled,
  applyDone,
  applyError,
  applyProgress,
  createDownloadRecord,
  isActive,
  startRecord,
  statusLabel,
} from '../shared/download-state.js'

test('format helpers', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(9), '0:09')
  assert.equal(formatTime(65), '1:05')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(formatBytes(0), '0 K')
  assert.equal(formatBytes(1024), '1 K')
  assert.equal(formatBytes(5 * 1024 * 1024), '5 M')
  assert.equal(formatBytes(1.5 * 1024 * 1024 * 1024), '1.5 G')
  assert.equal(percent(50, 200), 25)
  assert.equal(percent(5, 0), 0)
  assert.equal(truncate('abcdef', 4), 'abc\u2026')
  assert.equal(truncate('abc', 4), 'abc')
})

test('storage math', () => {
  const disk = summarizeDisk({ total: 1000, free: 250, app: 10, music: 20, system: 700, watchface: 20 })
  assert.equal(disk.used, 750)
  assert.equal(disk.usedPercent, 75)
  assert.equal(disk.freePercent, 25)
  assert.equal(estimateDownloadBytes(60), 960000)
  assert.equal(canFit(20 * 1024 * 1024, 3 * 1024 * 1024), true)
  assert.equal(canFit(9 * 1024 * 1024, 3 * 1024 * 1024), false)
  assert.match(storageWarning(9 * 1024 * 1024, 3 * 1024 * 1024), /Not enough storage/)
  assert.equal(storageWarning(30 * 1024 * 1024, 3 * 1024 * 1024), '')
})

test('URL allowlist accepts only authorised audio hosts', () => {
  assert.equal(isAllowedAudioUrl('https://archive.org/download/item/song.mp3'), true)
  assert.equal(isAllowedAudioUrl('https://ia801.us.archive.org/12/items/x/song.mp3'), true)
  assert.equal(isAllowedAudioUrl('https://prod-1.storage.jamendo.com/?trackid=1&format=mp32'), true)
  assert.equal(isAllowedAudioUrl('https://api.jamendo.com/v3.0/tracks'), true)
  assert.equal(isAllowedAudioUrl('https://p.scdn.co/mp3-preview/abc'), false)
  assert.equal(isAllowedAudioUrl('https://i.scdn.co/image/abc'), false)
  assert.equal(isAllowedAudioUrl('http://archive.org/download/x/y.mp3'), false)
  assert.equal(isAllowedAudioUrl('https://evilarchive.org/x.mp3'), false)
  assert.equal(isAllowedAudioUrl('https://archive.org.evil.com/x.mp3'), false)
  assert.equal(isAllowedArtworkUrl('https://i.scdn.co/image/ab67616d00001e02'), true)
  assert.equal(isAllowedArtworkUrl('https://archive.org/services/img/x'), true)
  assert.equal(isAllowedArtworkUrl('https://example.com/a.jpg'), false)
})

test('user links allow any public https MP3 and block private hosts', () => {
  assert.equal(isUserAudioUrl('https://example.com/song.mp3'), true)
  assert.equal(isUserAudioUrl('https://cdn.example.com/a/b.mp3?token=1'), true)
  assert.equal(isUserAudioUrl('http://example.com/song.mp3'), false)
  assert.equal(isUserAudioUrl('https://example.com/song.ogg'), false)
  assert.equal(isUserAudioUrl('https://example.com/page'), false)
  assert.equal(isUserAudioUrl('https://localhost/song.mp3'), false)
  assert.equal(isUserAudioUrl('https://127.0.0.1/song.mp3'), false)
  assert.equal(isUserAudioUrl('https://192.168.1.2/song.mp3'), false)
})

test('audio validation helpers', () => {
  assert.equal(isMp3Header([0x49, 0x44, 0x33, 0x03]), true)
  assert.equal(isMp3Header([0xff, 0xfb, 0x90, 0x00]), true)
  assert.equal(isMp3Header([0xff, 0xf1, 0x50, 0x80]), true)
  assert.equal(isMp3Header([0x52, 0x49, 0x46, 0x46]), false)
  assert.equal(isMp3Header(null), false)
  assert.equal(isJpegOrPng([0xff, 0xd8, 0xff, 0xe0]), true)
  assert.equal(isJpegOrPng([0x89, 0x50, 0x4e, 0x47]), true)
  assert.equal(isJpegOrPng([0x47, 0x49, 0x46, 0x38]), false)
  assert.equal(isAcceptableAudioSize(100 * 1024), true)
  assert.equal(isAcceptableAudioSize(1024), false)
  assert.equal(isAcceptableAudioSize(20 * 1024 * 1024), false)
  assert.equal(estimateBitrateKbps(960000, 60), 128)
  assert.equal(isTargetBitrate(128), true)
  assert.equal(isTargetBitrate(64), false)
  assert.equal(parseLength('3:05'), 185)
  assert.equal(parseLength('125.4'), 125)
  assert.equal(parseLength('n/a'), 0)
  assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 })
  assert.equal(safeJsonParse('oops', 'fallback'), 'fallback')
})

test('track identity and naming', () => {
  const id = makeTrackId('arc', 'item/one.mp3')
  assert.equal(id, makeTrackId('arc', 'item/one.mp3'))
  assert.match(id, /^arc-[a-z0-9-]+$/)
  assert.equal(fileNameForTrack({ id: 'arc-a b/c' }), 'soniq-arc-a-b-c.mp3')
  const track = normalizeTrack({ title: 'Song', artist: 'Band', duration: '12', provider: 'spotify' })
  assert.equal(track.source, 'spotify')
  assert.equal(track.duration, 12)
  assert.equal(normalizeTrack({ provider: 'archive' }).source, 'local')
  const deduped = dedupeTracks([
    { id: 'a', title: '1' },
    { id: 'a', title: '2' },
    { id: 'b', title: '3' },
  ])
  assert.equal(deduped.length, 2)
  assert.equal(deduped[0].title, '1')
})

test('library core add/remove/like/prune', () => {
  let library = createLibrary()
  const track = { id: 'arc-1', title: 'One', artist: 'A', provider: 'archive', file: '' }
  const first = addItem(library, { ...track, file: 'data://music/soniq-arc-1.mp3', size: 1000 })
  library = first.library
  assert.equal(first.added, true)
  assert.equal(library.items.length, 1)
  assert.equal(libraryBytes(library), 1000)

  const duplicate = addItem(library, { ...track, file: 'data://music/soniq-arc-1.mp3', size: 2000 })
  library = duplicate.library
  assert.equal(duplicate.added, false)
  assert.equal(library.items.length, 1)
  assert.equal(libraryBytes(library), 2000)

  library = setLiked(library, 'arc-1', true)
  assert.equal(isLiked(library, 'arc-1'), true)

  const pruned = pruneMissing(library, () => false)
  assert.equal(pruned.missing.length, 1)
  assert.equal(pruned.library.items.length, 0)
  assert.equal(pruned.library.likedIds.length, 0)

  let withTwo = addItem(createLibrary(), { ...track, id: 'arc-2', file: 'x.mp3' }).library
  withTwo = removeItem(withTwo, 'arc-2')
  assert.equal(withTwo.items.length, 0)

  const normalized = normalizeLibrary({ items: [{ id: 'a', file: 'f' }, { bad: true }], likedIds: ['a', 'a'] })
  assert.equal(normalized.items.length, 1)
  assert.deepEqual(normalized.likedIds, ['a'])

  const orphans = orphanAudioFiles(
    { items: [{ file: 'data://music/soniq-a.mp3' }] },
    ['soniq-a.mp3', 'soniq-b.mp3', 'other.mp3'],
  )
  assert.deepEqual(orphans, ['soniq-b.mp3'])
})

test('download state machine', () => {
  const record = createDownloadRecord({ id: 'arc-1', title: 'One', artist: 'A' })
  assert.equal(record.phase, 'idle')
  startRecord(record)
  assert.equal(record.phase, 'checking')
  assert.equal(isActive(record), true)
  applyProgress(record, { phase: 'download', progress: 42, loaded: 10, total: 20 })
  assert.equal(record.phase, 'downloading')
  assert.equal(statusLabel(record), 'Downloading 42%')
  applyProgress(record, { phase: 'transfer', progress: 80 })
  assert.equal(record.phase, 'transferring')
  assert.equal(isActive(record), true)
  applyDone(record)
  assert.equal(record.phase, 'done')
  assert.equal(isActive(record), false)
  assert.equal(statusLabel(record), 'Downloaded')

  const failed = createDownloadRecord({ id: 'b' })
  applyError(failed, 'nope')
  assert.equal(statusLabel(failed), 'nope')
  const canceled = createDownloadRecord({ id: 'c' })
  startRecord(canceled)
  applyCanceled(canceled)
  assert.equal(canceled.phase, 'canceled')
  assert.equal(isActive(canceled), false)
})
