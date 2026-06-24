import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../../constants/colors';

/**
 * Renders markdown-formatted text for chat bubbles.
 * Supports: **bold**, *italic*, `code`, ```code blocks```,
 * ## headings, - bullet lists, 1. numbered lists, --- horizontal rules.
 */
const MarkdownText = ({ text, style, isUser = false }) => {
  if (!text) return null;

  const textColor = isUser ? '#FFFFFF' : COLORS.textPrimary;
  const subduedColor = isUser ? 'rgba(255,255,255,0.7)' : COLORS.textSecondary;

  // ── Inline parser ─────────────────────────────────────────────────────
  const parseInline = (line, baseStyle, keyPrefix = '') => {
    const parts = [];
    // Combined regex: code, bold, italic
    const re = /(`(.+?)`)|(\*\*(.+?)\*\*)|((?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*))|(__(.+?)__)|(_([^_]+?)_)/g;
    let lastIndex = 0;
    let k = 0;
    let match;

    while ((match = re.exec(line)) !== null) {
      // Plain text before match
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`${keyPrefix}t${k++}`} style={baseStyle}>
            {line.slice(lastIndex, match.index)}
          </Text>
        );
      }

      if (match[1]) {
        // `code`
        parts.push(
          <Text
            key={`${keyPrefix}c${k++}`}
            style={[
              baseStyle,
              {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : 'rgba(139,92,246,0.08)',
                paddingHorizontal: 4,
                borderRadius: 3,
                fontSize: (baseStyle.fontSize || 15) - 1,
              },
            ]}
          >
            {match[2]}
          </Text>
        );
      } else if (match[3]) {
        // **bold**
        parts.push(
          <Text key={`${keyPrefix}b${k++}`} style={[baseStyle, { fontWeight: '700' }]}>
            {match[4]}
          </Text>
        );
      } else if (match[5]) {
        // *italic*
        parts.push(
          <Text key={`${keyPrefix}i${k++}`} style={[baseStyle, { fontStyle: 'italic' }]}>
            {match[6]}
          </Text>
        );
      } else if (match[7]) {
        // __bold__
        parts.push(
          <Text key={`${keyPrefix}B${k++}`} style={[baseStyle, { fontWeight: '700' }]}>
            {match[8]}
          </Text>
        );
      } else if (match[9]) {
        // _italic_
        parts.push(
          <Text key={`${keyPrefix}I${k++}`} style={[baseStyle, { fontStyle: 'italic' }]}>
            {match[10]}
          </Text>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(
        <Text key={`${keyPrefix}t${k++}`} style={baseStyle}>
          {line.slice(lastIndex)}
        </Text>
      );
    }

    if (parts.length === 0) {
      return <Text style={baseStyle}>{line}</Text>;
    }
    return <Text style={baseStyle}>{parts}</Text>;
  };

  // ── Block parser ──────────────────────────────────────────────────────
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  const baseText = {
    fontSize: 15,
    lineHeight: 22,
    color: textColor,
    ...(style && typeof style === 'object' && !Array.isArray(style) ? style : {}),
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // ── Code block ────────────────────────────────────────────────────
    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <View key={`cb${key++}`} style={s.codeBlock}>
          <Text
            style={[
              baseText,
              {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 13,
                lineHeight: 19,
                color: isUser ? '#FFFFFF' : '#1E293B',
              },
            ]}
          >
            {codeLines.join('\n')}
          </Text>
        </View>
      );
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      elements.push(
        <View
          key={`hr${key++}`}
          style={[s.hr, { backgroundColor: isUser ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }]}
        />
      );
      i++;
      continue;
    }

    // ── Heading ### ───────────────────────────────────────────────────
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes = { 1: 20, 2: 17, 3: 15 };
      elements.push(
        <View key={`h${key++}`} style={s.headingWrap}>
          {parseInline(headingMatch[2], {
            ...baseText,
            fontSize: sizes[level],
            fontWeight: '700',
            lineHeight: sizes[level] + 6,
          })}
        </View>
      );
      i++;
      continue;
    }

    // ── Bullet list ───────────────────────────────────────────────────
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      elements.push(
        <View key={`li${key++}`} style={s.listRow}>
          <Text style={[baseText, s.bullet]}>{'\u2022'}</Text>
          <View style={s.listContent}>
            {parseInline(bulletMatch[1], baseText, `li${key}`)}
          </View>
        </View>
      );
      i++;
      continue;
    }

    // ── Numbered list ─────────────────────────────────────────────────
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numMatch) {
      elements.push(
        <View key={`ol${key++}`} style={s.listRow}>
          <Text style={[baseText, s.numBullet]}>{numMatch[1]}.</Text>
          <View style={s.listContent}>
            {parseInline(numMatch[2], baseText, `ol${key}`)}
          </View>
        </View>
      );
      i++;
      continue;
    }

    // ── Empty line (spacer) ───────────────────────────────────────────
    if (trimmed === '') {
      elements.push(<View key={`sp${key++}`} style={s.spacer} />);
      i++;
      continue;
    }

    // ── Normal paragraph ──────────────────────────────────────────────
    elements.push(
      <View key={`p${key++}`} style={s.paragraph}>
        {parseInline(trimmed, baseText, `p${key}`)}
      </View>
    );
    i++;
  }

  return <View style={s.container}>{elements}</View>;
};

const s = StyleSheet.create({
  container: {
    gap: 2,
  },
  paragraph: {
    marginVertical: 2,
  },
  headingWrap: {
    marginTop: 8,
    marginBottom: 3,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 1,
    paddingRight: 4,
  },
  bullet: {
    width: 16,
    textAlign: 'center',
    marginTop: 1,
  },
  numBullet: {
    width: 22,
    textAlign: 'right',
    marginRight: 4,
    marginTop: 1,
  },
  listContent: {
    flex: 1,
  },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  hr: {
    height: 1,
    marginVertical: 8,
    borderRadius: 1,
  },
  spacer: {
    height: 6,
  },
});

export default MarkdownText;