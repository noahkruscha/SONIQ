/**
 * SONIQ settings page (runs inside the Zepp phone app).
 *
 * The OAuth component is the only supported way for a Zepp OS mini program to
 * obtain third-party tokens: it opens the provider login in the Zepp app and
 * hands the resulting tokens back here, where they are stored in the settings
 * storage that the phone-side service reads.
 *
 * Each TextInput lives alone inside its own container. Zepp's settings renderer
 * is more reliable that way than with several inputs as bare siblings.
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
const FIELD = { marginTop: '6px' }
const NOTE = { fontSize: '12px', color: '#888', lineHeight: '18px', marginTop: '8px' }
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
    const clientSecret = storage.getItem('spotify_client_secret') || ''
    const refreshToken = storage.getItem('spotify_refresh_token') || ''
    const userName = storage.getItem('spotify_user') || ''
    const premium = storage.getItem('spotify_premium') || ''
    const jamendoId = storage.getItem('jamendo_client_id') || ''

    const clientIdCard = View({ style: CARD }, [
      Text({ style: TITLE }, 'Spotify Client ID'),
      Text(
        { style: BODY },
        'Create an app at developer.spotify.com/dashboard and paste its Client ID here.',
      ),
      View({ style: FIELD }, [
        TextInput({
          label: 'Client ID',
          value: clientId,
          settingsKey: 'spotify_client_id',
          placeholder: 'e.g. 1a2b3c4d5e6f...',
          labelStyle: LABEL,
        }),
      ]),
      Text({ style: NOTE }, clientId ? 'Client ID saved.' : 'No Client ID saved yet.'),
    ])

    const secretCard = View({ style: CARD }, [
      Text({ style: TITLE }, 'Spotify Client Secret'),
      Text(
        { style: BODY },
        'Paste the Client Secret from the same Spotify app page. Spotify requires PKCE S256, ' +
          'but the Zepp sign-in window sends the plain method, so SONIQ signs in with your own ' +
          'secret instead.',
      ),
      View({ style: FIELD }, [
        TextInput({
          label: 'Client Secret',
          value: clientSecret,
          settingsKey: 'spotify_client_secret',
          placeholder: '32 characters',
          labelStyle: LABEL,
        }),
      ]),
      Text(
        { style: NOTE },
        clientSecret
          ? 'Secret saved on this phone only.'
          : 'No secret saved yet. Tap the field above to enter it.',
      ),
    ])

    const accountContent = refreshToken
      ? [
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
        ]
      : clientId && clientSecret
        ? [
            Auth({
              title: 'Spotify account',
              label: 'Connect Spotify',
              scope: SCOPES,
              authorizeUrl: 'https://accounts.spotify.com/authorize',
              requestTokenUrl: 'https://accounts.spotify.com/api/token',
              clientId,
              clientSecret,
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
              { style: NOTE },
              'Add the redirect URI shown by the Zepp sign-in window to your Spotify app first.',
            ),
          ]
        : [
            Text(
              { style: BODY },
              clientId && !clientSecret
                ? 'Save your Client Secret above, then connect.'
                : 'Save your Client ID and Client Secret above, then connect.',
            ),
          ]

    const accountCard = View({ style: CARD }, [Text({ style: TITLE }, 'Spotify account'), ...accountContent])

    const jamendoCard = View({ style: CARD }, [
      Text({ style: TITLE }, 'Jamendo'),
      Text(
        { style: BODY },
        'Optional: create a free app at devportal.jamendo.com and paste the Client ID to search ' +
          'Creative Commons tracks with 128 kbps MP3 downloads. Without it, SONIQ uses the Internet Archive.',
      ),
      View({ style: FIELD }, [
        TextInput({
          label: 'Jamendo Client ID',
          value: jamendoId,
          settingsKey: 'jamendo_client_id',
          placeholder: 'optional',
          labelStyle: LABEL,
        }),
      ]),
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
        Text({ style: { fontSize: '13px', color: '#777', marginTop: '2px' } }, 'v1.0.3 \u00b7 settings'),
      ]),
      clientIdCard,
      secretCard,
      accountCard,
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
