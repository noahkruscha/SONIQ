import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDownloadUrl,
  buildSearchUrl,
  isAuthorizedLicense,
  mapArchiveTrack,
  parseSearch,
  pickAudioFile,
} from '../shared/providers/archive.js'
import { buildSearchUrl as jamendoUrl, mapJamendoTrack, parseJamendo } from '../shared/providers/jamendo.js'
import {
  mapDevices,
  mapPlayback,
  mapPlaylist,
  mapPlaylistTracks,
  mapPlaylists,
  mapSearch,
  mapSpotifyTrack,
  pickImage,
  savedTrackIds,
} from '../shared/spotify.js'

test('archive search parsing and licence gate', () => {
  const json = {
    response: {
      docs: [
        { identifier: 'album1', title: ['Album One'], creator: ['Artist A'], licenseurl: 'https://creativecommons.org/licenses/by/4.0/' },
        { identifier: 'album2', title: 'No Licence', creator: 'Nobody' },
      ],
    },
  }
  const docs = parseSearch(json)
  assert.equal(docs.length, 2)
  assert.equal(docs[0].title, 'Album One')
  assert.equal(docs[0].creator, 'Artist A')
  assert.equal(isAuthorizedLicense(docs[0].licenseUrl), true)
  assert.equal(isAuthorizedLicense('https://creativecommons.org/publicdomain/mark/1.0/'), true)
  assert.equal(isAuthorizedLicense('https://example.com/licence'), false)
  assert.equal(isAuthorizedLicense(''), false)
  assert.match(buildSearchUrl('miles davis', 6), /archive\.org\/advancedsearch/)
  assert.match(buildSearchUrl('miles davis', 6), /mediatype%3A\(audio\)/)
})

test('archive picks a 128-160 kbps MP3 and builds a download URL', () => {
  const files = [
    { name: 'track.flac', format: 'Flac', size: '30000000' },
    { name: 'track_64.mp3', format: '64Kbps MP3', size: '480000', length: '60' },
    { name: 'track.mp3', format: 'VBR MP3', size: '960000', length: '60' },
    { name: 'track.ogg', format: 'Ogg Vorbis', size: '900000' },
  ]
  const picked = pickAudioFile(files)
  assert.ok(picked)
  assert.equal(picked.name, 'track.mp3')
  assert.equal(picked.bitrate, 128)
  assert.equal(picked.duration, 60)

  const tooBig = pickAudioFile([{ name: 'huge.mp3', format: 'MP3', size: '20000000', length: '60' }])
  assert.equal(tooBig, null)

  const url = buildDownloadUrl('my album', 'disc 1/track one.mp3')
  assert.equal(url, 'https://archive.org/download/my%20album/disc%201/track%20one.mp3')

  const track = mapArchiveTrack(
    { identifier: 'album1', title: 'Album', creator: 'Artist', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    picked,
    { metadata: { title: 'Album', creator: 'Artist', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' } },
  )
  assert.equal(track.provider, 'archive')
  assert.equal(track.source, undefined)
  assert.equal(track.duration, 60)
  assert.equal(track.artist, 'Artist')
  assert.match(track.id, /^arc-/)
  assert.match(track.artworkUrl, /archive\.org\/services\/img/)
})

test('jamendo parsing', () => {
  assert.match(jamendoUrl('jazz', 'client123', 10), /client_id=client123/)
  assert.match(jamendoUrl('jazz', 'client123', 10), /audioformat=mp32/)
  const json = {
    headers: { status: 'success' },
    results: [
      {
        id: '99',
        name: 'Blue',
        artist_name: 'Trio',
        album_name: 'Set',
        duration: 180,
        audio: 'https://prod-1.storage.jamendo.com/?trackid=99&format=mp32',
        audiodownload: 'https://prod-1.storage.jamendo.com/?trackid=99&format=mp32&download=1',
        audiodownload_allowed: true,
        image: 'https://usercontent.jamendo.com/cover.jpg',
        license_ccurl: 'https://creativecommons.org/licenses/by-nc/4.0/',
      },
    ],
  }
  const tracks = parseJamendo(json)
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].artist, 'Trio')
  assert.equal(tracks[0].size, 180 * 16000)
  assert.match(tracks[0].audioUrl, /download=1/)
  assert.match(tracks[0].id, /^jam-/)

  const streamOnly = mapJamendoTrack({ id: '1', name: 'X', duration: 10, audio: 'https://prod-1.storage.jamendo.com/x', audiodownload_allowed: false, audiodownload: 'https://x' })
  assert.equal(streamOnly.audioUrl, '')
  assert.equal(parseJamendo({ results: [streamOnly] }).length, 0)
})

test('spotify mapping', () => {
  assert.equal(pickImage([{ url: 'large', width: 640 }, { url: 'small', width: 64 }], 300), 'large')
  assert.equal(pickImage([], 300), '')

  const track = mapSpotifyTrack({
    id: 'abc',
    uri: 'spotify:track:abc',
    name: 'Song',
    duration_ms: 200000,
    artists: [{ name: 'A' }, { name: 'B' }],
    album: { name: 'Album', images: [{ url: 'cover', width: 300 }] },
    type: 'track',
  })
  assert.equal(track.provider, 'spotify')
  assert.equal(track.source, 'spotify')
  assert.equal(track.duration, 200)
  assert.equal(track.artist, 'A, B')
  assert.equal(track.artworkUrl, 'cover')
  assert.equal(mapSpotifyTrack({ id: 'x', type: 'episode' }), null)

  const search = mapSearch({
    tracks: { items: [{ id: 't1', name: 'T', type: 'track', artists: [], album: { images: [] } }] },
    artists: { items: [{ id: 'a1', name: 'Artist', images: [], genres: ['pop'] }] },
    albums: { items: [{ id: 'al1', name: 'Album', artists: [{ name: 'A' }], images: [] }] },
  })
  assert.equal(search.tracks.length, 1)
  assert.equal(search.artists[0].subtitle, 'pop')
  assert.equal(search.albums[0].subtitle, 'A')

  const playlists = mapPlaylists({
    items: [
      { id: 'p1', name: 'Mix', images: [{ url: 'x', width: 120 }], tracks: { total: 12 }, uri: 'spotify:playlist:p1' },
    ],
    total: 1,
  })
  assert.equal(playlists.items[0].trackCount, 12)
  assert.equal(mapPlaylist({ id: 'p2' }).trackCount, 0)

  const tracks = mapPlaylistTracks({
    items: [{ track: { id: 't2', name: 'Two', type: 'track', artists: [], album: { images: [] } } }, { track: null }],
    total: 2,
  })
  assert.equal(tracks.tracks.length, 1)
  assert.equal(tracks.total, 2)

  const devices = mapDevices({ devices: [{ id: 'd1', name: 'Phone', is_active: true, volume_percent: 40 }] })
  assert.equal(devices[0].isActive, true)
  assert.equal(devices[0].volume, 40)

  const playback = mapPlayback({
    is_playing: true,
    progress_ms: 5000,
    device: { id: 'd1', name: 'Phone', volume_percent: 40 },
    item: { id: 't3', type: 'track', name: 'Three', artists: [], album: { images: [] } },
  })
  assert.equal(playback.isPlaying, true)
  assert.equal(playback.track.title, 'Three')
  assert.equal(playback.device.name, 'Phone')
  assert.equal(playback.available, true)

  assert.deepEqual(savedTrackIds({ items: [{ track: { id: 'a' } }, { track: null }] }), ['a'])
})
