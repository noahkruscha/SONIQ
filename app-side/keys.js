/** Settings Storage keys shared by the settings page and the side service. */
export const KEYS = {
  clientId: 'spotify_client_id',
  refreshToken: 'spotify_refresh_token',
  accessToken: 'spotify_access_token',
  expiry: 'spotify_token_expiry',
  user: 'spotify_user',
  premium: 'spotify_premium',
  country: 'spotify_country',
  jamendoClientId: 'jamendo_client_id',
}

export function fail(code, message) {
  const error = new Error(`${code}: ${message || code}`)
  error.code = code
  return error
}
