/**
 * Maps transport/API failures to short, actionable watch messages. The app must
 * stay usable when any individual feature fails, so every call site shows one of
 * these strings instead of a raw stack trace.
 */

const MESSAGES = [
  [/ble disconnect|side service is not running|not connected/i, 'Phone not connected. Keep the Zepp app nearby.'],
  [/timeout|timed out/i, 'The phone took too long to respond. Try again.'],
  [/no_network|network request failed|fetch failed/i, 'The phone has no internet connection.'],
  [/spotify_not_configured/i, 'Add your Spotify Client ID in the Zepp app \u2192 SONIQ settings.'],
  [/spotify_secret_missing/i, 'Add your Spotify Client Secret in the Zepp app \u2192 SONIQ settings.'],
  [/not_authenticated|spotify_not_authenticated/i, 'Sign in to Spotify in the Zepp app \u2192 SONIQ settings.'],
  [/premium_required/i, 'Spotify playback control requires a Premium account.'],
  [/spotify_forbidden/i, 'Spotify refused that action. Check the account and try again.'],
  [/spotify_error/i, 'Spotify could not complete that request.'],
  [/rate_limited|429/i, 'Spotify is rate limiting requests. Try again in a minute.'],
  [/provider_key_missing/i, 'Add your Jamendo Client ID in the Zepp app \u2192 SONIQ settings.'],
  [/provider_unavailable/i, 'That music source is unavailable right now.'],
  [/no_results/i, 'No results found. Try a different search.'],
  [/invalid_audio|unsupported_format/i, 'That file is not a supported MP3.'],
  [/storage_full|insufficient_storage/i, 'Not enough storage on the watch.'],
  [/file_missing/i, 'The audio file is missing from the watch.'],
  [/canceled/i, 'Download canceled.'],
  [/auth_expired/i, 'Spotify session expired. Sign in again in the Zepp app.'],
]

export function friendlyError(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback
  const raw =
    typeof error === 'string'
      ? error
      : error.message || error.reason || (error.error && error.error.message) || JSON.stringify(error)
  for (const [pattern, message] of MESSAGES) {
    if (pattern.test(raw)) return message
  }
  return raw && raw.length < 90 ? raw : fallback
}

export function isCanceled(error) {
  return /canceled|cancelled/i.test(String((error && (error.message || error.reason)) || error || ''))
}
