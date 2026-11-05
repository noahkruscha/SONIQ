/**
 * Keyboard data + editing logic modelled on the Zepp OS "Simple keyboard"
 * sample (numeric/symbol layer, shift, backspace). Layout itself is rendered
 * by lib/keyboard-ui.js; this module stays pure so the editing rules can be
 * unit tested.
 */

export const LAYER = {
  LETTERS: 'letters',
  SYMBOLS: 'symbols',
}

export const MAX_QUERY_LENGTH = 48

export const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
export const SYMBOL_ROWS = ['1234567890', '-/:;()$&@"', '.,?!\'#%*+']

export const FUNC_KEYS = {
  SHIFT: 'shift',
  BACKSPACE: 'backspace',
  SPACE: 'space',
  LAYER: 'layer',
  CLEAR: 'clear',
  SEARCH: 'search',
}

export function rowsForLayer(layer) {
  return layer === LAYER.SYMBOLS ? SYMBOL_ROWS : LETTER_ROWS
}

/** Returns the character produced by a key in the current state. */
export function keyCharacter(key, caps, layer) {
  if (layer === LAYER.SYMBOLS) return key
  return caps ? key.toUpperCase() : key
}

/**
 * Applies one key press.
 * state: { query, caps, layer }
 * returns a new state (never mutates the input).
 */
export function applyKey(state, key) {
  const next = {
    query: state.query || '',
    caps: Boolean(state.caps),
    layer: state.layer === LAYER.SYMBOLS ? LAYER.SYMBOLS : LAYER.LETTERS,
  }

  switch (key) {
    case FUNC_KEYS.SHIFT:
      next.caps = !next.caps
      return next
    case FUNC_KEYS.BACKSPACE:
      next.query = next.query.slice(0, -1)
      return next
    case FUNC_KEYS.SPACE:
      if (next.query.length < MAX_QUERY_LENGTH) next.query += ' '
      return next
    case FUNC_KEYS.CLEAR:
      next.query = ''
      return next
    case FUNC_KEYS.LAYER:
      next.layer = next.layer === LAYER.SYMBOLS ? LAYER.LETTERS : LAYER.SYMBOLS
      next.caps = false
      return next
    case FUNC_KEYS.SEARCH:
      return next
    default:
      break
  }

  if (next.query.length < MAX_QUERY_LENGTH) {
    next.query += keyCharacter(key, next.caps, next.layer)
  }
  // Shift behaves like a single-shot modifier, as on the reference keyboard.
  if (next.caps && next.layer === LAYER.LETTERS) next.caps = false
  return next
}

export function canSearch(query) {
  return String(query || '').trim().length >= 2
}

export function trimQuery(query) {
  return String(query || '').replace(/\s+/g, ' ').trim()
}
