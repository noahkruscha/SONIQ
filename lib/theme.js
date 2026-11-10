/** Spotify-inspired dark palette, tuned for the 390x450 AMOLED panel. */

export const C = {
  bg: 0x000000,
  surface: 0x121212,
  surfaceAlt: 0x1c1c1e,
  surfacePress: 0x2a2a2c,
  border: 0x262626,
  track: 0x2f2f31,
  text: 0xffffff,
  textDim: 0xb3b3b3,
  textMuted: 0x7a7a7c,
  green: 0x1db954,
  greenPressed: 0x168f41,
  greenDim: 0x0f5c2c,
  red: 0xf2544c,
  amber: 0xf5c518,
  white: 0xffffff,
  black: 0x000000,
}

export const M = {
  width: 390,
  height: 450,
  pad: 24,
  contentW: 342,
  cardRadius: 18,
  smallRadius: 12,
}

// Watch typography is deliberately large: 390 px across a 1.4" panel makes
// 10-13 px text hard to read at arm's length.
export const F = {
  xxs: 16,
  xs: 18,
  sm: 21,
  md: 24,
  lg: 28,
  xl: 32,
  xxl: 38,
}

export const DOUBLE_TAP_MS = 350
