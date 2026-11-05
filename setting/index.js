/**
 * SONIQ settings page (runs inside the Zepp phone app).
 *
 * The OAuth component is the only supported way for a Zepp OS mini program to
 * obtain third-party tokens: it opens the provider login in the Zepp app and
 * hands the resulting tokens back here, where they are stored in the settings
 * storage that the phone-side service reads.
 */
const CARD = {
  background: '#ffffff',
  borderRadius: '12px',
  padding: '14px',
  margin: '10px 10px 0 10px',
  boxShadow: '0px 1px 10px rgba(0,0,0,0.06)',
}

const TITLE = { fontSize: '17px', fontWeight: '600', color: '#111', marginBottom: '6px' }
const BODY = { fontSize: '13px', color: '#666', lineHeight: '19px' }
const LABEL = { fontSize: '13px', color: '#111', marginTop: '8px' }
const FOOT = { fontSize: '12px', color: '#999', padding: '14px', lineHeight: '18px' }

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
].join(' ')

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const clientId = storage.getItem('spotify_client_id') || ''
    const refreshToken = storage.getItem('spotify_refresh_token') || ''
    const userName = storage.getItem('spotify_user') || ''
    const premium = storage.getItem('spotify_premium') || ''
    const jamendoId = storage.getItem('jamendo_client_id') || ''

    const spotifyCard = View({ style: CARD }, [
      Text({ style: TITLE }, 'Spotify'),
      Text(
        { style: BODY },
        'Create an app at developer.spotify.com/dashboard, then paste its Client ID below. ' +
          'Add the redirect URI shown by the Zepp sign-in window to that Spotify app before connecting.',
      ),
      TextInput({
        label: 'Spotify Client ID',
        value: clientId,
        settingsKey: 'spotify_client_id',
        placeholder: 'e.g. 1a2b3c4d5e6f...',
        labelStyle: LABEL,
      }),
      refreshToken
        ? View({ style: { marginTop: '10px' } }, [
            Text({ style: { fontSize: '14px', color: '#111' } }, `Signed in as ${userName || 'Spotify user'}`),
            Text(
              { style: { fontSize: '12px', color: '#1db954', marginTop: '4px' } },
              premium === 'premium' ? 'Premium: playback control enabled' : 'Free account: browsing, search and likes only',
            ),
            Button({
              label: 'Sign out',
              style: {
                marginTop: '10px',
                background: '#fff',
                color: '#f2544c',
                border: '1px solid #f2544c',
                borderRadius: '8px',
                fontSize: '13px',
              },
              onClick: () => {
                storage.setItem('spotify_refresh_token', '')
                storage.setItem('spotify_access_token', '')
                storage.setItem('spotify_token_expiry', 0)
                storage.setItem('spotify_user', '')
                storage.setItem('spotify_premium', '')
                storage.setItem('spotify_country', '')
              },
            }),
          ])
        : clientId
          ? View({ style: { marginTop: '10px' } }, [
              Auth({
                title: 'Spotify account',
                label: 'Connect Spotify',
                scope: SCOPES,
                authorizeUrl: 'https://accounts.spotify.com/authorize',
                requestTokenUrl: 'https://accounts.spotify.com/api/token',
                clientId,
                pkce: true,
                onAccessToken: (token) => {
                  const accessToken = token && (token.access_token || token.accessToken)
                  const refreshToken = token && (token.refresh_token || token.refreshToken)
                  const expiresIn = token && (token.expires_in || token.expiresIn)
                  if (!accessToken) return
                  storage.setItem('spotify_access_token', accessToken)
                  if (refreshToken) storage.setItem('spotify_refresh_token', refreshToken)
                  storage.setItem(
                    'spotify_token_expiry',
                    Date.now() + (Number(expiresIn) || 3600) * 1000 - 90000,
                  )
                  try {
                    fetch('https://api.spotify.com/v1/me', {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    })
                      .then((response) => response.json())
                      .then((profile) => {
                        storage.setItem('spotify_user', profile.display_name || '')
                        storage.setItem('spotify_premium', profile.product || '')
                        storage.setItem('spotify_country', profile.country || '')
                      })
                      .catch(() => {})
                  } catch (error) {
                    // The phone service fills the profile in on first sync.
                  }
                },
              }),
              Text(
                { style: { ...BODY, marginTop: '8px' } },
                'Use the same Client ID here as in your Spotify app; the redirect URI must be whitelisted there.',
              ),
            ])
          : Text(
              { style: { ...BODY, marginTop: '8px' } },
              'Save your Client ID, then reopen this settings page to connect.',
            ),
    ])

    const jamendoCard = View({ style: CARD }, [
      Text({ style: TITLE }, 'Jamendo'),
      Text(
        { style: BODY },
        'Optional: create a free app at devportal.jamendo.com and paste the Client ID to search ' +
          'Creative Commons tracks with 128 kbps MP3 downloads. Without it, SONIQ uses the Internet Archive.',
      ),
      TextInput({
        label: 'Jamendo Client ID',
        value: jamendoId,
        settingsKey: 'jamendo_client_id',
        placeholder: 'optional',
        labelStyle: LABEL,
      }),
    ])

    const notes = View({ style: CARD }, [
      Text({ style: TITLE }, 'How SONIQ works'),
      Text(
        { style: BODY },
        'Downloads are MP3 files stored on the watch, so they play offline without the phone.\n' +
          'Spotify audio cannot be downloaded: the Web API only exposes DRM-protected streams. ' +
          'Spotify tracks play on a Spotify Connect device and can be liked, searched and browsed here.\n' +
          'Audio routing (speaker or Bluetooth headset) is handled by Zepp OS; apps cannot select it.',
      ),
    ])

    return View({ style: { background: '#f4f4f6', minHeight: '100vh', paddingBottom: '20px' } }, [
      View({ style: { padding: '16px 14px 0 14px' } }, [
        Text({ style: { fontSize: '22px', fontWeight: '700', color: '#111' } }, 'SONIQ'),
        Text({ style: { fontSize: '13px', color: '#777', marginTop: '2px' } }, 'Offline-first music for Amazfit Active'),
      ]),
      spotifyCard,
      jamendoCard,
      notes,
      View({ style: { padding: '0 10px' } }, [
        Text(
          { style: FOOT },
          'SONIQ keeps downloaded music in its own library. The "Downloaded" playlist never syncs to Spotify.',
        ),
      ]),
    ])
  },
})
