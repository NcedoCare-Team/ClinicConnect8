// src/constants/colors.js
// NcedoCare — Healthcare Green/Teal Palette
// Primary: Forest Green  |  Priority: Red/Orange/Yellow/Green  |  BG: Clean White

export const COLORS = {
  // ── Primary Green (Brand) ─────────────────────────────────
  primary:          '#1B6B47',   // Forest green — main brand CTA
  primaryDark:      '#134D33',   // Deep green   — pressed / dark variant
  primaryLight:     '#2D8A5E',   // Mid green    — light accents
  primaryVeryLight: '#EBF5EF',   // Near-white green tint — card backgrounds
  primaryGlow:      '#A8D5BC',   // Green highlight — borders / glows

  // ── Ink / Dark ────────────────────────────────────────────
  ink:              '#0A0A0F',   // True black
  inkDark:          '#0F1A14',   // Rich dark green-black — text/icons on dark
  inkSoft:          '#1A2E22',   // Soft dark forest      — secondary dark bg
  inkMid:           '#2E4A38',   // Mid forest            — metadata text
  inkLight:         '#5A7A67',   // Light forest slate    — placeholder / hint

  // ── Background ────────────────────────────────────────────
  background:           '#FFFFFF',
  backgroundSecondary:  '#F4FAF6',
  backgroundTertiary:   '#E8F4EC',

  // ── Text ──────────────────────────────────────────────────
  textPrimary:   '#0F1A14',  // Near-black  — headings
  textSecondary: '#3D5C48',  // Dark green-slate — body
  textTertiary:  '#7A9A85',  // Light green-slate — hints / metadata

  // ── Triage Priority Colors ────────────────────────────────
  critical:      '#DC2626',   // Red   — CRITICAL priority
  criticalLight: '#FEF2F2',
  high:          '#EA580C',   // Orange — HIGH priority
  highLight:     '#FFF7ED',
  medium:        '#D97706',   // Amber  — MEDIUM priority
  mediumLight:   '#FFFBEB',
  low:           '#16A34A',   // Green  — LOW priority
  lowLight:      '#F0FDF4',

  // ── Status ────────────────────────────────────────────────
  success:      '#16A34A',
  successLight: '#F0FDF4',
  error:        '#DC2626',
  errorLight:   '#FEF2F2',
  warning:      '#D97706',
  warningLight: '#FFFBEB',
  info:         '#0EA5E9',
  infoLight:    '#F0F9FF',

  // ── UI Chrome ─────────────────────────────────────────────
  border:       '#D1E8D9',
  borderLight:  '#EBF5EF',
  white:        '#FFFFFF',
  black:        '#000000',
  transparent:  'transparent',
};

export default COLORS;
