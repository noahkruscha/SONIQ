import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyKey,
  canSearch,
  FUNC_KEYS,
  LAYER,
  LETTER_ROWS,
  MAX_QUERY_LENGTH,
  rowsForLayer,
  trimQuery,
} from '../shared/keyboard.js'

const initial = { query: '', caps: false, layer: LAYER.LETTERS }

test('keyboard layout mirrors the reference app shape', () => {
  assert.deepEqual(LETTER_ROWS, ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'])
  assert.equal(rowsForLayer(LAYER.SYMBOLS).length, 3)
})

test('typing, shift and caps', () => {
  let state = applyKey(initial, 'h')
  state = applyKey(state, 'i')
  assert.equal(state.query, 'hi')

  let caps = applyKey(state, FUNC_KEYS.SHIFT)
  assert.equal(caps.caps, true)
  caps = applyKey(caps, 'a')
  assert.equal(caps.query, 'hiA')
  // Shift is single-shot, like the reference keyboard.
  assert.equal(caps.caps, false)
  caps = applyKey(caps, 'b')
  assert.equal(caps.query, 'hiAb')
})

test('backspace, space, clear and layers', () => {
  let state = { query: 'abc', caps: false, layer: LAYER.LETTERS }
  state = applyKey(state, FUNC_KEYS.BACKSPACE)
  assert.equal(state.query, 'ab')
  state = applyKey(state, FUNC_KEYS.SPACE)
  assert.equal(state.query, 'ab ')
  state = applyKey(state, FUNC_KEYS.CLEAR)
  assert.equal(state.query, '')

  state = applyKey(state, FUNC_KEYS.LAYER)
  assert.equal(state.layer, LAYER.SYMBOLS)
  state = applyKey(state, '7')
  assert.equal(state.query, '7')
  state = applyKey(state, FUNC_KEYS.LAYER)
  assert.equal(state.layer, LAYER.LETTERS)
})

test('query length is bounded and search needs two characters', () => {
  let state = initial
  for (let i = 0; i < MAX_QUERY_LENGTH + 10; i += 1) state = applyKey(state, 'a')
  assert.equal(state.query.length, MAX_QUERY_LENGTH)
  assert.equal(canSearch('a'), false)
  assert.equal(canSearch('ab'), true)
  assert.equal(canSearch('  '), false)
  assert.equal(trimQuery('  daft   punk  '), 'daft punk')
})
