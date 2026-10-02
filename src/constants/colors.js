// Clinic Connect 8 — palette from the problem-statement presentation.
// Canvas: deep teal  |  Accents: teal, coral, sun, mint, blue, plum

export const PALETTE = {
  bg: '#062f38',
  bgLift: '#0b5a63',
  ink: '#f4fbf9',
  mut: '#a9d6cc',
  teal: '#16b3a5',
  coral: '#f26b4e',
  sun: '#f5b83d',
  mint: '#7bcfb5',
  blue: '#5a9bdc',
  plum: '#b088d0',
  glass: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.18)',
};

export const COLORS = {
  // ── Brand ─────────────────────────────────────────────────
  primary:          PALETTE.teal,
  primaryDark:      PALETTE.bgLift,
  primaryLight:     PALETTE.mint,
  primaryVeryLight: '#e7f6f3',
  primaryGlow:      '#b7ebe4',
  primarySoft:      'rgba(22, 179, 165, 0.16)',
  primaryFaded:     'rgba(22, 179, 165, 0.08)',
  canvas:           PALETTE.bg,
  sun:              PALETTE.sun,
  coral:            PALETTE.coral,
  mint:             PALETTE.mint,
  blue:             PALETTE.blue,
  plum:             PALETTE.plum,

  // ── Ink ───────────────────────────────────────────────────
  ink:              PALETTE.bg,
  inkDark:          PALETTE.bg,
  inkSoft:          '#0a4550',
  inkMid:           '#1d5c62',
  inkLight:         '#5d8f86',

  // ── Background (paper, so body text stays readable) ───────
  background:           PALETTE.ink,
  backgroundSecondary:  '#e7f4f1',
  backgroundTertiary:   '#d5ebe6',

  // ── Text ──────────────────────────────────────────────────
  textPrimary:   PALETTE.bg,
  textSecondary: '#3d6e66',
  textTertiary:  '#6d9a92',

  // ── Priority (same hues, darkened where used as text) ─────
  critical:      '#e1553a',
  criticalLight: '#fde8e3',
  high:          '#e06a28',
  highLight:     '#fff1e8',
  medium:        '#9a6b12',
  mediumLight:   '#fff4d6',
  low:           '#0e7c6b',
  lowLight:      '#e5f7f2',

  // ── Status ────────────────────────────────────────────────
  success:      '#0e7c6b',
  successLight: '#e5f7f2',
  error:        PALETTE.coral,
  errorLight:   '#fde8e3',
  warning:      '#9a6b12',
  warningLight: '#fff4d6',
  info:         '#3a7ec4',
  infoLight:    '#e8f3fb',

  // ── UI Chrome ─────────────────────────────────────────────
  border:       'rgba(6, 47, 56, 0.14)',
  borderLight:  'rgba(6, 47, 56, 0.08)',
  white:        '#FFFFFF',
  black:        '#000000',
  transparent:  'transparent',
};

export default COLORS;
