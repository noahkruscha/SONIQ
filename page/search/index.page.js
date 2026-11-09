import { BasePage } from '@zeppos/zml/base-page'
import { deleteWidget } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from '../../shared/constants'
import { applyKey, canSearch, FUNC_KEYS, LAYER, trimQuery } from '../../shared/keyboard'
import { createBridge } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { drawKeyboard, drawProviderRow, drawQuery } from '../../lib/keyboard-ui'
import { background, header, navTo } from '../../lib/page-kit'
import { getState } from '../../lib/state'
import { C, F, M } from '../../lib/theme'
import { set, setText, text } from '../../lib/ui-kit'

const PROVIDERS = [
  { id: 'archive', label: 'Archive' },
  { id: 'jamendo', label: 'Jamendo' },
  { id: 'spotify', label: 'Spotify' },
]

Page(
  BasePage({
    name: 'soniq.search',

    build() {
      this.store = getState()
      this.bridge = createBridge(this.request.bind(this))
      this.query = (this.store && this.store.ui.searchQuery) || ''
      this.provider = (this.store && this.store.ui.searchProvider) || 'archive'
      this.caps = false
      this.layer = LAYER.LETTERS
      this.keyboardWidgets = []

      background(null)
      header(null, {
        title: 'Search',
        subtitle: 'Find something to save offline',
      })

      const chipRefs = drawProviderRow(null, {
        y: 70,
        providers: PROVIDERS,
        active: this.provider,
        onSelect: (id) => this.selectProvider(id),
      })
      this.chipWidgets = chipRefs.chips.map((chip) => chip.widget)

      this.queryRefs = drawQuery(null, {
        y: 120,
        query: this.query,
        onClear: () => this.setQuery(''),
      })

      this.hintRef = text(null, {
        x: M.pad,
        y: 182,
        w: M.contentW,
        h: 20,
        text: 'Type at least 2 characters',
        text_size: F.xxs,
        color: C.textMuted,
      })

      this.renderKeyboard()
    },

    onDestroy() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      if (this.keyboardWidgets) {
        this.keyboardWidgets.forEach((widgetRef) => {
          try {
            deleteWidget(widgetRef)
          } catch (error) {
            // ignore
          }
        })
        this.keyboardWidgets = []
      }
    },

    renderKeyboard() {
      if (this.keyboardWidgets) {
        this.keyboardWidgets.forEach((widgetRef) => {
          try {
            deleteWidget(widgetRef)
          } catch (error) {
            // ignore
          }
        })
      }
      const refs = drawKeyboard(null, {
        y: 204,
        layer: this.layer,
        caps: this.caps,
        onKey: (key) => this.handleKey(key),
      })
      this.keyboardWidgets = refs.widgets
    },

    handleKey(key) {
      if (key === FUNC_KEYS.SEARCH) {
        this.submit()
        return
      }
      const before = { caps: this.caps, layer: this.layer }
      const next = applyKey({ query: this.query, caps: this.caps, layer: this.layer }, key)
      this.query = next.query
      this.caps = next.caps
      this.layer = next.layer
      setText(this.queryRefs.query, this.query)
      set(this.queryRefs.query, { color: this.query ? C.text : C.textMuted })
      if (before.caps !== this.caps || before.layer !== this.layer) {
        this.renderKeyboard()
      }
      this.schedulePrefetch()
    },

    setQuery(value) {
      this.query = value
      setText(this.queryRefs.query, this.query)
      this.schedulePrefetch()
    },

    selectProvider(id) {
      if (id === this.provider) return
      if (id === 'spotify' && !(this.store && this.store.spotify.authenticated)) {
        showToast({ content: 'Connect Spotify in the Zepp app first.' })
        return
      }
      this.provider = id
      this.store.ui.searchProvider = id
      this.hint({ content: 'Ready to search ' + id, color: C.textMuted })
      // Chips are cheap; redraw the page chrome that depends on selection.
      this.redrawChips()
    },

    redrawChips() {
      if (this.chipWidgets) {
        this.chipWidgets.forEach((widgetRef) => {
          try {
            deleteWidget(widgetRef)
          } catch (error) {
            // ignore
          }
        })
      }
      const refs = drawProviderRow(null, {
        y: 70,
        providers: PROVIDERS,
        active: this.provider,
        onSelect: (id) => this.selectProvider(id),
      })
      this.chipWidgets = refs.chips.map((chip) => chip.widget)
    },

    hint({ content, color = C.textMuted }) {
      if (!this.hintRef) return
      setText(this.hintRef, content)
      set(this.hintRef, { color })
    },

    schedulePrefetch() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      const query = trimQuery(this.query)
      if (!canSearch(query)) {
        this.hint({ content: `Type at least ${SEARCH_MIN_CHARS} characters` })
        return
      }
      this.hint({ content: 'Searching\u2026' })
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        this.prefetch()
      }, SEARCH_DEBOUNCE_MS)
    },

    async prefetch() {
      const query = trimQuery(this.query)
      if (!canSearch(query)) return
      const provider = this.provider
      try {
        let items = []
        if (provider === 'spotify') {
          const result = await this.bridge.spotifySearch(query)
          items = (result && result.tracks) || []
        } else {
          const result = await this.bridge.musicSearch(query, provider)
          items = (result && result.items) || []
        }
        if (this.query !== query || this.provider !== provider) return
        this.store.ui.searchResults = items
        this.store.ui.searchCachedFor = `${provider}:${query}`
        this.hint({
          content: items.length ? `${items.length} results ready \u2022 tap Search` : 'No results found',
          color: items.length ? C.green : C.textMuted,
        })
      } catch (error) {
        this.hint({ content: friendlyError(error, 'Search failed.'), color: C.red })
      }
    },

    submit() {
      const query = trimQuery(this.query)
      if (!canSearch(query)) {
        showToast({ content: 'Enter at least 2 characters.' })
        return
      }
      this.store.ui.searchQuery = query
      this.store.ui.searchProvider = this.provider
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
      }
      navTo('page/results/index.page', { query, provider: this.provider })
    },
  }),
)
