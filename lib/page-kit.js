import { deleteWidget, setStatusBarVisible } from '@zos/ui'
import { back, push } from '@zos/router'
import { align } from '@zos/ui'
import { C, F, M } from './theme'
import { image, rect, text } from './ui-kit'

/** Shared chrome for the secondary screens. */

export const HEADER_H = 56

export function header(parent, options = {}) {
  const title = options.title || ''
  const subtitle = options.subtitle || ''
  const refs = {}

  if (options.backButton !== false) {
    refs.back = image(parent, {
      x: 18,
      y: 22,
      w: 24,
      h: 24,
      src: 'icon/back.png',
      click_func: () => {
        if (typeof options.onBack === 'function') options.onBack()
        else back()
      },
    })
  }

  refs.title = text(parent, {
    x: 54,
    y: subtitle ? 14 : 18,
    w: 280,
    h: 24,
    text: title,
    text_size: F.lg,
    color: C.text,
  })

  if (subtitle) {
    refs.subtitle = text(parent, {
      x: 54,
      y: 34,
      w: 290,
      h: 16,
      text: subtitle,
      text_size: F.xs,
      color: C.textDim,
    })
  }

  if (options.actionIcon) {
    refs.action = image(parent, {
      x: 342,
      y: 18,
      w: 28,
      h: 28,
      src: options.actionIcon,
      click_func: options.onAction,
    })
  }

  return refs
}

export function background(parent) {
  try {
    setStatusBarVisible(false)
  } catch (error) {
    // Only available on square screens.
  }
  return rect(parent, { x: 0, y: 0, w: M.width, h: M.height, color: C.bg })
}

export function emptyState(parent, { y = 180, icon = 'icon/search.png', title, message }) {
  const refs = {}
  if (icon) {
    refs.icon = image(parent, { x: (M.width - 40) / 2, y, w: 40, h: 40, src: icon })
  }
  refs.title = text(parent, {
    x: 40,
    y: y + 54,
    w: M.width - 80,
    h: 26,
    text: title,
    text_size: F.md,
    color: C.text,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  refs.message = text(parent, {
    x: 44,
    y: y + 82,
    w: M.width - 88,
    h: 44,
    text: message,
    text_size: F.xs,
    color: C.textDim,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  return refs
}

export function pill(parent, { x, y, w, h = 22, label, color = C.surfaceAlt, textColor = C.textDim }) {
  const box = rect(parent, { x, y, w, h, color, radius: h / 2 })
  const labelWidget = text(parent, {
    x,
    y,
    w,
    h,
    text: label,
    text_size: 10,
    color: textColor,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
  })
  return { box, labelWidget }
}

export function navTo(url, params) {
  push({ url, params: params || '' })
}

export function destroy(widgetRef) {
  if (!widgetRef) return
  try {
    deleteWidget(widgetRef)
  } catch (error) {
    // ignore
  }
}

/** Text-only notice (used for honest limitations inside the UI). */
export function notice(parent, { x = M.pad, y, w = M.contentW, message, color = C.textMuted }) {
  return text(parent, {
    x,
    y,
    w,
    h: 40,
    text: message,
    text_size: F.xxs,
    color,
    align_v: align.CENTER_V,
  })
}
