import { align } from '@zos/ui'
import { LAYER, LETTER_ROWS, SYMBOL_ROWS, FUNC_KEYS } from '../shared/keyboard'
import { C, F, M } from './theme'
import { button, image, rect, text } from './ui-kit'

/**
 * In-app QWERTY keyboard, derived from the reference "Simple keyboard" app:
 * letters / symbols layers, shift, delete, space and a primary action key.
 * It is drawn with BUTTON widgets so keys stay crisp and cheap to update.
 */

const KEY_GAP = 3
const KEY_H = 42
const ROW_GAP = 5
const KEY_W = 31

export function keyboardHeight() {
  return 3 * (KEY_H + ROW_GAP) + KEY_H + ROW_GAP + 48
}

export function drawKeyboard(parent, { y, layer, caps, onKey }) {
  const refs = { widgets: [] }
  const rows = layer === LAYER.SYMBOLS ? SYMBOL_ROWS : LETTER_ROWS

  rows.forEach((row, rowIndex) => {
    const keys = row.split('')
    const rowWidth = keys.length * KEY_W + (keys.length - 1) * KEY_GAP
    let x = M.pad + Math.max(0, (M.contentW - rowWidth) / 2)
    const rowY = y + rowIndex * (KEY_H + ROW_GAP)
    keys.forEach((key) => {
      const label = layer === LAYER.LETTERS && caps ? key.toUpperCase() : key
      const widgetRef = button(parent, {
        x,
        y: rowY,
        w: KEY_W,
        h: KEY_H,
        text: label,
        text_size: F.sm,
        color: C.text,
        normal_color: C.surfaceAlt,
        press_color: C.surfacePress,
        radius: 10,
        click_func: () => onKey(key),
      })
      refs.widgets.push(widgetRef)
      x += KEY_W + KEY_GAP
    })
  })

  const funcY = y + 3 * (KEY_H + ROW_GAP)
  const layerLabel = layer === LAYER.SYMBOLS ? 'abc' : '123'

  refs.widgets.push(
    button(parent, {
      x: M.pad,
      y: funcY,
      w: 56,
      h: KEY_H,
      text: layerLabel,
      text_size: F.xs,
      color: C.textDim,
      normal_color: C.surfaceAlt,
      press_color: C.surfacePress,
      radius: 10,
      click_func: () => onKey(FUNC_KEYS.LAYER),
    }),
  )

  refs.widgets.push(
    button(parent, {
      x: M.pad + 62,
      y: funcY,
      w: 44,
      h: KEY_H,
      text: caps ? 'aA' : 'Aa',
      text_size: F.xs,
      color: caps ? C.green : C.textDim,
      normal_color: C.surfaceAlt,
      press_color: C.surfacePress,
      radius: 10,
      click_func: () => onKey(FUNC_KEYS.SHIFT),
    }),
  )

  refs.widgets.push(
    button(parent, {
      x: M.pad + 112,
      y: funcY,
      w: M.contentW - 112 - 62,
      h: KEY_H,
      text: 'space',
      text_size: F.xs,
      color: C.textDim,
      normal_color: C.surfaceAlt,
      press_color: C.surfacePress,
      radius: 10,
      click_func: () => onKey(FUNC_KEYS.SPACE),
    }),
  )

  refs.widgets.push(
    image(parent, {
      x: M.pad + M.contentW - 42,
      y: funcY + 7,
      w: 28,
      h: 28,
      src: 'icon/backspace.png',
      click_func: () => onKey(FUNC_KEYS.BACKSPACE),
    }),
  )

  const actionY = funcY + KEY_H + ROW_GAP
  refs.widgets.push(
    button(parent, {
      x: M.pad,
      y: actionY,
      w: M.contentW,
      h: 48,
      text: 'Search',
      text_size: F.sm,
      color: 0x08130b,
      normal_color: C.green,
      press_color: C.greenPressed,
      radius: 24,
      click_func: () => onKey(FUNC_KEYS.SEARCH),
    }),
  )

  return refs
}

export function drawQuery(parent, { y, query, onClear }) {
  const refs = {}
  refs.box = rect(parent, {
    x: M.pad,
    y,
    w: M.contentW,
    h: 56,
    color: C.surface,
    radius: 16,
  })
  refs.query = text(parent, {
    x: M.pad + 16,
    y,
    w: M.contentW - 62,
    h: 56,
    text: query || '',
    text_size: F.md,
    color: query ? C.text : C.textMuted,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
  })
  refs.clear = image(parent, {
    x: M.pad + M.contentW - 40,
    y: y + 14,
    w: 28,
    h: 28,
    src: 'icon/close.png',
    click_func: onClear,
  })
  return refs
}

export function drawProviderRow(parent, { y, providers, active, onSelect }) {
  const refs = { chips: [] }
  const gap = 6
  const width = Math.floor((M.contentW - gap * (providers.length - 1)) / providers.length)
  providers.forEach((provider, index) => {
    const x = M.pad + index * (width + gap)
    const selected = provider.id === active
    const chip = button(parent, {
      x,
      y,
      w: width,
      h: 42,
      text: provider.label,
      text_size: F.xxs,
      color: selected ? 0x08130b : C.textDim,
      normal_color: selected ? C.green : C.surfaceAlt,
      press_color: selected ? C.greenPressed : C.surfacePress,
      radius: 21,
      click_func: () => onSelect(provider.id),
    })
    refs.chips.push({ provider, widget: chip })
  })
  return refs
}
