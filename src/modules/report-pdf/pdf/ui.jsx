// Blocos de construção reutilizados pelas páginas do relatório.

import { Page, View, Text, Image, Svg, Rect, Path, Circle, Defs, LinearGradient, Stop } from '@react-pdf/renderer';
import { COLORS, PAGE, CONTENT_WIDTH, FONT } from './theme';
import { signedPercent } from './formatters';
import { styles } from './pageStyles';

// ── Cabeçalho e rodapé fixos das páginas de conteúdo ──

function RunningHeader({ agencyName, documentTitle }) {
  return (
    <View fixed style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 3, height: 11, backgroundColor: COLORS.primary, borderRadius: 2, marginRight: 6 }} />
          <Text style={{ fontSize: 7.5, letterSpacing: 1.1, color: COLORS.textSoft, fontFamily: FONT, fontWeight: 'bold' }}>
            {String(agencyName || '').toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 7.5, color: COLORS.textMuted }}>{documentTitle}</Text>
      </View>
      <View style={{ height: 0.75, backgroundColor: COLORS.line }} />
    </View>
  );
}

function RunningFooter({ clientName }) {
  return (
    <View
      fixed
      style={{
        position: 'absolute',
        bottom: 24,
        left: PAGE.marginX,
        right: PAGE.marginX,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ fontSize: 7, color: COLORS.textMuted }}>{clientName}</Text>
      <Text
        style={{ fontSize: 7, color: COLORS.textMuted }}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

/** Página de conteúdo com cabeçalho, rodapé e numeração automática. */
export function ContentPage({ agencyName, documentTitle, clientName, children }) {
  return (
    <Page size="A4" style={styles.page}>
      <RunningHeader agencyName={agencyName} documentTitle={documentTitle} />
      {children}
      <RunningFooter clientName={clientName} />
    </Page>
  );
}

// ── Títulos ──

export function SectionTitle({ eyebrow, title, description, spacing = 14 }) {
  return (
    <View style={{ marginBottom: spacing }}>
      {eyebrow ? (
        <Text style={{ fontSize: 7, letterSpacing: 1.4, color: COLORS.primary, fontFamily: FONT, fontWeight: 'bold', marginBottom: 5 }}>
          {String(eyebrow).toUpperCase()}
        </Text>
      ) : null}
      <Text style={{ fontSize: 16, fontFamily: FONT, fontWeight: 'bold', color: COLORS.text, letterSpacing: -0.2 }}>
        {title}
      </Text>
      {description ? (
        <Text style={{ fontSize: 8.5, color: COLORS.textSoft, marginTop: 4, lineHeight: 1.45 }}>{description}</Text>
      ) : null}
    </View>
  );
}

export function SubTitle({ children, style }) {
  return (
    <Text style={[{ fontSize: 10, fontFamily: FONT, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 }, style]}>
      {children}
    </Text>
  );
}

// ── Selo de variação vs período anterior ──

export function DeltaBadge({ value, higherIsBetter = true, neutral = false }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  const isPositiveDirection = value >= 0;
  const isGood = neutral ? null : (higherIsBetter ? isPositiveDirection : !isPositiveDirection);
  const color = isGood === null ? COLORS.neutral : isGood ? COLORS.positive : COLORS.negative;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={6} height={6} viewBox="0 0 6 6" style={{ marginRight: 3 }}>
        <Path d={isPositiveDirection ? 'M3 0 L6 5 L0 5 Z' : 'M3 6 L0 1 L6 1 Z'} fill={color} />
      </Svg>
      <Text style={{ fontSize: 7, color, fontFamily: FONT, fontWeight: 'bold' }}>
        {signedPercent(value)}
      </Text>
    </View>
  );
}

// ── Cartão de indicador ──

export function KpiCard({ label, value, delta, higherIsBetter = true, neutralDelta = false, caption, highlight = false, width }) {
  return (
    <View
      style={{
        width,
        backgroundColor: highlight ? COLORS.primary : COLORS.surface,
        borderRadius: 7,
        borderWidth: highlight ? 0 : 0.75,
        borderColor: COLORS.line,
        borderStyle: 'solid',
        paddingVertical: 11,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          fontSize: 6.8,
          letterSpacing: 0.7,
          color: highlight ? 'rgba(255,255,255,0.78)' : COLORS.textMuted,
          fontFamily: FONT,
          fontWeight: 'bold',
        }}
      >
        {String(label || '').toUpperCase()}
      </Text>
      <Text
        style={{
          fontSize: 15,
          fontFamily: FONT,
          fontWeight: 'bold',
          color: highlight ? COLORS.onInk : COLORS.text,
          marginTop: 5,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, minHeight: 9 }}>
        {highlight ? (
          delta !== null && delta !== undefined && Number.isFinite(delta) ? (
            <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, fontWeight: 'bold' }}>
              {signedPercent(delta)} vs. período anterior
            </Text>
          ) : null
        ) : (
          <DeltaBadge value={delta} higherIsBetter={higherIsBetter} neutral={neutralDelta} />
        )}
        {caption && !highlight ? (
          <Text style={{ fontSize: 6.8, color: COLORS.textMuted, marginLeft: delta ? 5 : 0 }}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Grade de KPIs em linhas de `perRow` cartões. */
export function KpiGrid({ items, perRow = 3, gap = 9 }) {
  const cardWidth = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));

  return (
    <View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', marginBottom: rowIndex === rows.length - 1 ? 0 : gap }}>
          {row.map((item, index) => (
            <View key={item.label} style={{ marginRight: index === row.length - 1 ? 0 : gap }}>
              <KpiCard {...item} width={cardWidth} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Bloco de texto com marcador ──

export function BulletList({ items = [], color = COLORS.primary, spacing = 7 }) {
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={index}
          style={{ flexDirection: 'row', marginBottom: index === items.length - 1 ? 0 : spacing }}
        >
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, marginTop: 4, marginRight: 8 }} />
          <Text style={{ flex: 1, fontSize: 9, color: COLORS.textSoft, lineHeight: 1.5 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Caixa de destaque com barra lateral colorida. */
export function CalloutBox({ title, children, tone = 'primary' }) {
  const accent = tone === 'dark' ? COLORS.ink : COLORS.primary;
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        borderRadius: 7,
        borderWidth: 0.75,
        borderColor: COLORS.line,
        borderStyle: 'solid',
        padding: 13,
      }}
    >
      <View style={{ width: 2.5, borderRadius: 2, backgroundColor: accent, marginRight: 11 }} />
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={{ fontSize: 7.5, letterSpacing: 0.9, color: accent, fontFamily: FONT, fontWeight: 'bold', marginBottom: 6 }}>
            {String(title).toUpperCase()}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

// ── Tabela ──

export function Table({ columns, rows, zebra = true }) {
  return (
    <View>
      {/* Cabeçalho */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.text,
          borderBottomStyle: 'solid',
          paddingBottom: 6,
        }}
      >
        {columns.map((column) => (
          <Text
            key={column.key}
            style={{
              width: column.width,
              fontSize: 6.8,
              letterSpacing: 0.6,
              color: COLORS.textSoft,
              fontFamily: FONT,
              fontWeight: 'bold',
              textAlign: column.align || 'left',
            }}
          >
            {String(column.label).toUpperCase()}
          </Text>
        ))}
      </View>

      {/* Linhas */}
      {rows.map((row, rowIndex) => (
        <View
          key={row.key || rowIndex}
          wrap={false}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 7,
            backgroundColor: zebra && rowIndex % 2 === 1 ? COLORS.surface : 'transparent',
            borderBottomWidth: 0.5,
            borderBottomColor: COLORS.lineSoft,
            borderBottomStyle: 'solid',
          }}
        >
          {columns.map((column) => (
            <View key={column.key} style={{ width: column.width, paddingRight: 4 }}>
              {column.render
                ? column.render(row)
                : (
                  <Text
                    style={{
                      fontSize: 8,
                      color: column.strong ? COLORS.text : COLORS.textSoft,
                      fontFamily: FONT,
                      fontWeight: column.strong ? 'bold' : 'normal',
                      textAlign: column.align || 'left',
                    }}
                  >
                    {row[column.key]}
                  </Text>
                )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Capa ──

// Altura do SVG de fundo: 1pt a menos que a página. O motor de layout recusa
// desenhar um SVG cujo tamanho iguale/exceda a altura disponível — ele empurraria
// todo o conteúdo da capa para uma página extra.
const COVER_HEIGHT = PAGE.height - 1;

export function CoverBackground() {
  return (
    <Svg
      width={PAGE.width}
      height={COVER_HEIGHT}
      viewBox={`0 0 ${PAGE.width} ${COVER_HEIGHT}`}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      <Defs>
        <LinearGradient id="coverBase" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0A0D14" />
          <Stop offset="0.55" stopColor="#0D141F" />
          <Stop offset="1" stopColor="#071016" />
        </LinearGradient>
        <LinearGradient id="coverGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={COLORS.primaryLight} stopOpacity="0.30" />
          <Stop offset="1" stopColor={COLORS.primary} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="coverAccent" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={COLORS.primaryLight} />
          <Stop offset="1" stopColor={COLORS.primary} stopOpacity="0.15" />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={PAGE.width} height={COVER_HEIGHT} fill="url(#coverBase)" />

      {/* Brilhos difusos — círculos concêntricos de baixa opacidade */}
      <Circle cx={PAGE.width - 40} cy={110} r={210} fill="url(#coverGlow)" />
      <Circle cx={PAGE.width - 40} cy={110} r={140} fill={COLORS.primary} fillOpacity={0.06} />
      <Circle cx={-30} cy={COVER_HEIGHT - 120} r={190} fill={COLORS.primary} fillOpacity={0.05} />

      {/* Malha diagonal discreta no rodapé */}
      {Array.from({ length: 14 }).map((_, index) => (
        <Path
          key={index}
          d={`M ${index * 46 - 60} ${COVER_HEIGHT} L ${index * 46 + 90} ${COVER_HEIGHT - 150}`}
          stroke={COLORS.primaryLight}
          strokeOpacity={0.05}
          strokeWidth={0.8}
        />
      ))}

      <Rect x={0} y={COVER_HEIGHT - 5} width={PAGE.width} height={5} fill="url(#coverAccent)" />
    </Svg>
  );
}

export function CoverLogo({ src, height = 34, fallbackText }) {
  if (src) {
    return <Image src={src} style={{ height, maxWidth: 150, objectFit: 'contain' }} />;
  }
  if (!fallbackText) return null;
  return (
    <Text style={{ fontSize: 13, fontFamily: FONT, fontWeight: 'bold', color: COLORS.onInk, letterSpacing: 1 }}>
      {String(fallbackText).toUpperCase()}
    </Text>
  );
}
