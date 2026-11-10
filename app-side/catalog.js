import { MAX_TRACK_SECONDS, PROVIDER, SEARCH_RESULT_LIMIT } from '../shared/constants'
import {
  buildMetadataUrl,
  buildSearchUrl,
  isAuthorizedLicense,
  mapArchiveTrack,
  parseSearch,
  pickAudioFile,
} from '../shared/providers/archive'
import { buildSearchUrl as buildJamendoUrl, parseJamendo } from '../shared/providers/jamendo'
import { buildSearchUrl as buildOpenverseUrl, parseOpenverse } from '../shared/providers/openverse'
import { isAllowedAudioUrl, safeJsonParse } from '../shared/validate'
import { KEYS, fail } from './keys'

const CACHE_TTL = 60000

/** Authorised download catalogue: Internet Archive (keyless) and Jamendo. */
export function createCatalog(ctx) {
  const cache = new Map()

  function parse(response) {
    const body = response && response.body
    if (typeof body === 'string') return safeJsonParse(body, null)
    return body || null
  }

  function firstString(value) {
    if (Array.isArray(value)) {
      const found = value.find((entry) => typeof entry === 'string' && entry.trim())
      return found || ''
    }
    return value == null ? '' : String(value)
  }

  function cached(key) {
    const hit = cache.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > CACHE_TTL) {
      cache.delete(key)
      return null
    }
    return hit.value
  }

  async function archiveSearch(query) {
    const response = await ctx.fetch({
      url: buildSearchUrl(query, 12),
      timeout: 15000,
    })
    const docs = parseSearch(parse(response)).slice(0, 12)
    const tracks = []

    await Promise.all(
      docs.map(async (doc) => {
        try {
          const metaResponse = await ctx.fetch({
            url: buildMetadataUrl(doc.identifier),
            timeout: 12000,
          })
          const meta = parse(metaResponse)
          if (!meta) return
          const license = firstString(meta.metadata && meta.metadata.licenseurl) || doc.licenseUrl
          if (!isAuthorizedLicense(license)) return
          const fileInfo = pickAudioFile(meta.files)
          if (!fileInfo) return
          const track = mapArchiveTrack({ ...doc, licenseUrl: license }, fileInfo, meta)
          if (track.duration > MAX_TRACK_SECONDS) return
          if (!isAllowedAudioUrl(track.audioUrl)) return
          tracks.push(track)
        } catch (error) {
          // One broken item must not break the whole search.
        }
      }),
    )

    return tracks.slice(0, SEARCH_RESULT_LIMIT)
  }

  async function openverseSearch(query) {
    const response = await ctx.fetch({
      url: buildOpenverseUrl(query, SEARCH_RESULT_LIMIT),
      headers: { 'User-Agent': 'SONIQ/1.0 (Zepp OS watch app)' },
      timeout: 15000,
    })
    return parseOpenverse(parse(response))
      .filter((track) => track.audioUrl && isAllowedAudioUrl(track.audioUrl))
      .filter((track) => !track.duration || track.duration <= MAX_TRACK_SECONDS)
      .slice(0, SEARCH_RESULT_LIMIT)
  }

  async function jamendoSearch(query) {
    const clientId = ctx.settings.getItem(KEYS.jamendoClientId) || ''
    if (!clientId) throw fail('provider_key_missing', 'Jamendo client id not set')
    const response = await ctx.fetch({
      url: buildJamendoUrl(query, clientId, SEARCH_RESULT_LIMIT),
      timeout: 15000,
    })
    const json = parse(response)
    if (json && json.headers && json.headers.status && json.headers.status !== 'success') {
      throw fail('provider_unavailable', json.headers.error_message || 'Jamendo error')
    }
    return parseJamendo(json)
      .filter((track) => track.duration <= MAX_TRACK_SECONDS)
      .filter((track) => isAllowedAudioUrl(track.audioUrl))
      .slice(0, SEARCH_RESULT_LIMIT)
  }

  return {
    async search(params) {
      const query = String(params.query || '').trim()
      const provider =
        params.provider === PROVIDER.JAMENDO
          ? PROVIDER.JAMENDO
          : params.provider === PROVIDER.OPENVERSE
            ? PROVIDER.OPENVERSE
            : PROVIDER.ARCHIVE
      if (query.length < 2) throw fail('no_results', 'query too short')

      const key = `${provider}:${query.toLowerCase()}`
      const hit = cached(key)
      if (hit) return { provider, items: hit, cached: true }

      const items =
        provider === PROVIDER.JAMENDO
          ? await jamendoSearch(query)
          : provider === PROVIDER.OPENVERSE
            ? await openverseSearch(query)
            : await archiveSearch(query)

      cache.set(key, { at: Date.now(), value: items })
      return { provider, items, cached: false }
    },

    async resolve(params) {
      const track = params.track || {}
      if (!isAllowedAudioUrl(track.audioUrl)) {
        throw fail('invalid_audio', 'source is not an authorised audio host')
      }
      try {
        const response = await ctx.fetch({
          url: track.audioUrl,
          method: 'HEAD',
          timeout: 15000,
        })
        const headers = (response && response.headers) || {}
        const contentType = String(
          headers['content-type'] || headers['Content-Type'] || '',
        ).toLowerCase()
        const length = Number(headers['content-length'] || headers['Content-Length']) || 0
        if (contentType && contentType.indexOf('audio') === -1 && contentType.indexOf('octet-stream') === -1) {
          throw fail('unsupported_format', contentType)
        }
        return {
          audioUrl: track.audioUrl,
          size: length || track.size || 0,
          contentType: contentType || 'audio/mpeg',
        }
      } catch (error) {
        if (error && error.code) throw error
        // HEAD may be unsupported; the watch still verifies the MP3 header after transfer.
        return { audioUrl: track.audioUrl, size: track.size || 0, contentType: '' }
      }
    },
  }
}
