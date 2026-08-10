// Gráficos do relatório desenhados em SVG vetorial nativo do @react-pdf.
// Nada de imagem rasterizada: as coordenadas são calculadas aqui, então o
// resultado permanece nítido em qualquer zoom e em impressão.

import { Svg, G, Path, Line, Rect, Circle, Text as SvgText, Defs, LinearGradient, Stop } from '@react-pdf/renderer';
import { COLORS, CHART_SERIES } from './theme';

// ── Escala "bonita": arredonda o topo do eixo para 1/2/5 × 10^n ──
function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// Rótulo do eixo de investimento: milhares viram "k", o resto fica inteiro.
function formatAxisValue(value) {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `R$ ${(thousands >= 10 ? Math.round(thousands) : Number(thousands.toFixed(1))).toString().replace('.', ',')}k`;
  }
  return `R$ ${Math.round(value)}`;
}

function buildSmoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  // Curva Catmull-Rom convertida em Bézier cúbica — suaviza a linha sem
  // ultrapassar os pontos reais de dado.
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

/**
 * Evolução diária: área + linha do investimento com barras do resultado ao fundo.
 * `data`: [{ label, spend, results }]
 */
export function DailyEvolutionChart({ data = [], width = 507, height = 190, resultLabel = 'Resultados' }) {
  if (data.length === 0) return null;

  const padding = { top: 18, right: 16, bottom: 26, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxSpend = niceCeil(Math.max(...data.map((d) => d.spend || 0), 1));
  const maxResults = niceCeil(Math.max(...data.map((d) => d.results || 0), 1));

  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const pointX = (index) => padding.left + (data.length > 1 ? index * stepX : plotWidth / 2);
  const spendY = (value) => padding.top + plotHeight - (Math.max(0, value) / maxSpend) * plotHeight;

  const points = data.map((d, index) => ({ x: pointX(index), y: spendY(d.spend || 0) }));
  const linePath = buildSmoothPath(points);
  const areaPath = linePath
    ? `${linePath} L ${points[points.length - 1].x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`
    : '';

  const barWidth = Math.max(2, Math.min(14, plotWidth / (data.length * 1.9)));

  // Rótulos do eixo X: no máximo 8, distribuídos uniformemente, sempre incluindo
  // o último dia — descartado quando ficaria colado no rótulo anterior.
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const labelIndexes = [];
  for (let index = 0; index < data.length; index += labelStep) labelIndexes.push(index);
  const lastIndex = data.length - 1;
  if (labelIndexes[labelIndexes.length - 1] !== lastIndex) {
    const minGap = Math.max(1, Math.round(labelStep / 2));
    if (lastIndex - labelIndexes[labelIndexes.length - 1] < minGap) labelIndexes.pop();
    labelIndexes.push(lastIndex);
  }

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="spendArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COLORS.primary} stopOpacity="0.22" />
          <Stop offset="1" stopColor={COLORS.primary} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Linhas-guia horizontais + escala de investimento */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + plotHeight - ratio * plotHeight;
        return (
          <G key={ratio}>
            <Line
              x1={padding.left}
              y1={y}
              x2={padding.left + plotWidth}
              y2={y}
              stroke={ratio === 0 ? COLORS.line : COLORS.lineSoft}
              strokeWidth={ratio === 0 ? 1 : 0.75}
            />
            <SvgText
              x={padding.left - 8}
              y={y + 3}
              textAnchor="end"
              style={{ fontSize: 6.5, fill: COLORS.textMuted }}
            >
              {formatAxisValue(maxSpend * ratio)}
            </SvgText>
          </G>
        );
      })}

      {/* Barras de resultado (escala própria, ao fundo) */}
      {data.map((d, index) => {
        const barHeight = ((d.results || 0) / maxResults) * plotHeight * 0.55;
        if (barHeight <= 0) return null;
        return (
          <Rect
            key={`bar-${index}`}
            x={pointX(index) - barWidth / 2}
            y={padding.top + plotHeight - barHeight}
            width={barWidth}
            height={barHeight}
            fill={COLORS.primaryLight}
            fillOpacity={0.28}
            rx={1.5}
          />
        );
      })}

      {/* Área + linha de investimento */}
      {areaPath ? <Path d={areaPath} fill="url(#spendArea)" /> : null}
      {linePath ? <Path d={linePath} stroke={COLORS.primary} strokeWidth={1.8} fill="none" /> : null}

      {/* Marcadores só quando a série é curta o suficiente para não poluir */}
      {data.length <= 20
        ? points.map((point, index) => (
            <Circle key={`dot-${index}`} cx={point.x} cy={point.y} r={2.1} fill={COLORS.page} stroke={COLORS.primary} strokeWidth={1.2} />
          ))
        : null}

      {/* Eixo X */}
      {labelIndexes.map((index) => (
        <SvgText
          key={`x-${index}`}
          x={pointX(index)}
          y={height - 10}
          textAnchor="middle"
          style={{ fontSize: 6.5, fill: COLORS.textMuted }}
        >
          {data[index].label}
        </SvgText>
      ))}

      {/* Legenda */}
      <G>
        <Rect x={padding.left} y={2} width={7} height={3} rx={1.5} fill={COLORS.primary} />
        <SvgText x={padding.left + 11} y={5.5} style={{ fontSize: 6.5, fill: COLORS.textSoft }}>Investimento</SvgText>
        <Rect x={padding.left + 74} y={1} width={5} height={5} rx={1} fill={COLORS.primaryLight} fillOpacity={0.45} />
        <SvgText x={padding.left + 84} y={5.5} style={{ fontSize: 6.5, fill: COLORS.textSoft }}>{resultLabel}</SvgText>
      </G>
    </Svg>
  );
}

/**
 * Barras horizontais com rótulo à esquerda e valor à direita.
 * `data`: [{ label, value, caption }]
 */
export function HorizontalBars({ data = [], width = 240, barHeight = 15, gap = 9, valueFormatter = (v) => v, color = COLORS.primary }) {
  if (data.length === 0) return null;

  const labelWidth = 78;
  const valueWidth = 62;
  const trackWidth = width - labelWidth - valueWidth;
  const max = Math.max(...data.map((d) => d.value || 0), 1);
  const height = data.length * (barHeight + gap);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((item, index) => {
        const y = index * (barHeight + gap);
        const filled = Math.max(2, ((item.value || 0) / max) * trackWidth);
        return (
          <G key={`${item.label}-${index}`}>
            <SvgText x={0} y={y + barHeight / 2 + 3} style={{ fontSize: 7.5, fill: COLORS.textSoft }}>
              {item.label}
            </SvgText>
            <Rect x={labelWidth} y={y + 2} width={trackWidth} height={barHeight - 4} rx={2} fill={COLORS.surfaceAlt} />
            <Rect x={labelWidth} y={y + 2} width={filled} height={barHeight - 4} rx={2} fill={color} />
            <SvgText
              x={width}
              y={y + barHeight / 2 + 3}
              textAnchor="end"
              style={{ fontSize: 7.5, fill: COLORS.text }}
            >
              {valueFormatter(item.value)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * Rosca de participação com legenda embaixo.
 * `data`: [{ label, value }]
 */
export function DonutChart({ data = [], size = 132, thickness = 22, centerLabel = '', centerValue = '' }) {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  if (!total) return null;

  const radius = size / 2;
  const innerRadius = radius - thickness;
  const center = radius;

  // Ângulo inicial de cada fatia = soma das anteriores, a partir do topo.
  const startAngles = data.reduce(
    (angles, item) => [...angles, angles[angles.length - 1] + ((item.value || 0) / total) * Math.PI * 2],
    [-Math.PI / 2]
  );

  const arcs = data.map((item, index) => {
    const slice = ((item.value || 0) / total) * Math.PI * 2;
    const start = startAngles[index];
    const end = startAngles[index + 1];

    const largeArc = slice > Math.PI ? 1 : 0;
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const x3 = center + innerRadius * Math.cos(end);
    const y3 = center + innerRadius * Math.sin(end);
    const x4 = center + innerRadius * Math.cos(start);
    const y4 = center + innerRadius * Math.sin(start);

    return {
      key: `${item.label}-${index}`,
      color: CHART_SERIES[index % CHART_SERIES.length],
      // Fatia única (100%) não pode ser um único arco fechado — vira um anel.
      d: slice >= Math.PI * 2 - 0.001
        ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius} Z M ${center} ${center - innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${center - 0.01} ${center - innerRadius} Z`
        : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`,
    };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc) => (
        <Path key={arc.key} d={arc.d} fill={arc.color} />
      ))}
      {centerValue ? (
        <SvgText x={center} y={center + 1} textAnchor="middle" style={{ fontSize: 13, fill: COLORS.text }}>
          {centerValue}
        </SvgText>
      ) : null}
      {centerLabel ? (
        <SvgText x={center} y={center + 12} textAnchor="middle" style={{ fontSize: 6.5, fill: COLORS.textMuted }}>
          {centerLabel}
        </SvgText>
      ) : null}
    </Svg>
  );
}

/**
 * Barra única de participação (usada na tabela de campanhas).
 */
export function ShareBar({ ratio = 0, width = 60, height = 5, color = COLORS.primary }) {
  const filled = Math.max(1.5, Math.min(1, ratio) * width);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill={COLORS.surfaceAlt} />
      <Rect x={0} y={0} width={filled} height={height} rx={height / 2} fill={color} />
    </Svg>
  );
}
