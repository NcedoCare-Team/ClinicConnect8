// src/constants/colors.js
// VisionAlly — Blue/Black Professional Palette
// Primary: Royal Blue  |  Accent: Near-Black  |  BG: Clean White

export const COLORS = {
  // ── Primary Blue ──────────────────────────────────────────
  primary:          '#2563EB',   // Vibrant royal blue  — main brand CTA
  primaryDark:      '#1E40AF',   // Deep navy            — pressed / dark variant
  primaryLight:     '#3B82F6',   // Sky blue             — light accents
  primaryVeryLight: '#EFF6FF',   // Near-white blue tint — card backgrounds
  primaryGlow:      '#BFDBFE',   // Blue highlight       — borders / glows

  // ── Ink / Black ───────────────────────────────────────────
  ink:              '#0A0A0F',   // True black            — black buttons
  inkDark:          '#0F172A',   // Rich dark navy-black  — text/icons on dark
  inkSoft:          '#1E293B',   // Soft dark slate       — secondary dark bg
  inkMid:           '#334155',   // Mid slate             — metadata text
  inkLight:         '#64748B',   // Light slate           — placeholder / hint

  // ── Background ────────────────────────────────────────────
  background:           '#FFFFFF',
  backgroundSecondary:  '#F8FAFC',
  backgroundTertiary:   '#F1F5F9',

  // ── Text ──────────────────────────────────────────────────
  textPrimary:   '#0F172A',  // Near-black  — headings
  textSecondary: '#475569',  // Slate       — body
  textTertiary:  '#94A3B8',  // Light slate — hints / metadata

  // ── Status ────────────────────────────────────────────────
  success:      '#10B981',
  successLight: '#ECFDF5',
  error:        '#EF4444',
  errorLight:   '#FEF2F2',
  warning:      '#F59E0B',
  warningLight: '#FFFBEB',
  info:         '#0EA5E9',
  infoLight:    '#F0F9FF',

  // ── UI Chrome ─────────────────────────────────────────────
  border:       '#E2E8F0',
  borderLight:  '#F1F5F9',
  white:        '#FFFFFF',
  black:        '#000000',
  transparent:  'transparent',
  gold:         '#F59E0B',   // Favourites star
  
  // ── Gradient presets (use with LinearGradient colors prop) ─
  // gradientBlue:  [primary, primaryDark]
  // gradientBlack: [inkSoft, ink]
  // gradientCard:  [white, backgroundSecondary]
};

export default COLORS;