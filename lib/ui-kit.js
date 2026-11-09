import { createWidget, widget, prop, align, event } from '@zos/ui'
import { C, F } from './theme'

/**
 * Thin wrappers over @zos/ui. Every helper accepts an optional parent so the
 * same code can build page-level widgets and widgets inside a VIEW_CONTAINER.
 */

const TAP_SLOP = 14
const TAP_MS = 900

/**
 * A click that fires on touch-down also fires when the finger starts a scroll.
 * Non-button widgets therefore wait for CLICK_UP and only count as a tap when
 * the finger barely moved and was released quickly.
 */
function bindTap(ref, onClick) {
  let start = null
  try {
    ref.addEventListener(event.CLICK_DOWN, (info) => {
      start = {
        x: Number(info && info.x) || 0,
        y: Number(info && info.y) || 0,
        at: Date.now(),
      }
    })
    ref.addEventListener(event.CLICK_UP, (info) => {
      const down = start
      start = null
      if (!down) return
      const dx = Math.abs((Number(info && info.x) || 0) - down.x)
      const dy = Math.abs((Number(info && info.y) || 0) - down.y)
      if (dx > TAP_SLOP || dy > TAP_SLOP) return
      if (Date.now() - down.at > TAP_MS) return
      onClick()
    })
  } catch (error) {
    // Widgets without touch support simply stay non-interactive.
  }
}

export function make(parent, type, options) {
  const settings = { ...options }
  let onClick = null
  // BUTTON has no tap-up event worth guarding; every other widget translates
  // its click_func into a guarded tap so scrolling cannot trigger it.
  if (type !== widget.BUTTON && typeof settings.click_func === 'function') {
    onClick = settings.click_func
    delete settings.click_func
  }
  const ref = parent ? parent.createWidget(type, settings) : createWidget(type, settings)
  if (onClick) bindTap(ref, onClick)
  return ref
}

export function rect(parent, options) {
  return make(parent, widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    radius: 0,
    color: C.surface,
    ...options,
  })
}

export function circle(parent, options) {
  return make(parent, widget.CIRCLE, {
    center_x: 0,
    center_y: 0,
    radius: 10,
    color: C.green,
    ...options,
  })
}

export function text(parent, options) {
  return make(parent, widget.TEXT, {
    x: 0,
    y: 0,
    w: 100,
    h: 24,
    text: '',
    text_size: F.md,
    color: C.text,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
    ...options,
  })
}

export function image(parent, options) {
  return make(parent, widget.IMG, {
    x: 0,
    y: 0,
    w: 24,
    h: 24,
    src: 'icon/blank.png',
    ...options,
  })
}

export function button(parent, options) {
  return make(parent, widget.BUTTON, {
    x: 0,
    y: 0,
    w: 100,
    h: 44,
    text: '',
    text_size: F.sm,
    color: C.text,
    normal_color: C.surfaceAlt,
    press_color: C.surfacePress,
    radius: 12,
    ...options,
  })
}

/** Icon-only tappable control. */
export function iconButton(parent, options) {
  const { x, y, size, src, onClick, ...rest } = options
  return image(parent, {
    x,
    y,
    w: size,
    h: size,
    src,
    click_func: onClick,
    ...rest,
  })
}

export function arc(parent, options) {
  return make(parent, widget.ARC, {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    start_angle: -90,
    end_angle: 270,
    line_width: 4,
    color: C.green,
    ...options,
  })
}

export function set(widgetRef, props) {
  if (!widgetRef) return
  try {
    widgetRef.setProperty(prop.MORE, props)
  } catch (error) {
    // A widget that the current firmware cannot update should never break a screen.
  }
}

export function setText(widgetRef, value) {
  set(widgetRef, { text: value == null ? '' : String(value) })
}

export function setColor(widgetRef, color) {
  set(widgetRef, { color })
}

export function setSrc(widgetRef, src) {
  set(widgetRef, { src })
}

export function setVisible(widgetRef, visible) {
  if (!widgetRef) return
  try {
    widgetRef.setProperty(prop.VISIBLE, visible ? 1 : 0)
  } catch (error) {
    // ignore
  }
}

/** Rounded card used across the app. */
export function card(parent, { x, y, w, h, color = C.surface, radius = 16, onClick }) {
  return rect(parent, { x, y, w, h, color, radius, click_func: onClick })
}

/** Large primary action button (green pill). */
export function primaryButton(parent, { x, y, w, h = 56, text: label, onClick, disabled }) {
  const bg = disabled ? C.surfaceAlt : C.green
  const fg = disabled ? C.textMuted : 0x08130b
  const bgWidget = rect(parent, {
    x,
    y,
    w,
    h,
    color: bg,
    radius: h / 2,
    click_func: disabled ? undefined : onClick,
  })
  const labelWidget = text(parent, {
    x,
    y,
    w,
    h,
    text: label,
    text_size: F.sm,
    color: fg,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  return { bgWidget, labelWidget, geometry: { x, y, w, h } }
}

export function sectionLabel(parent, { x, y, w = 342, label }) {
  return text(parent, {
    x,
    y,
    w,
    h: 18,
    text: label,
    text_size: F.xs,
    color: C.textMuted,
  })
}

export function divider(parent, { x, y, w = 342, color = C.border }) {
  return rect(parent, { x, y, w, h: 1, color })
}
