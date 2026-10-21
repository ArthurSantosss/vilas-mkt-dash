import { useMemo, useState } from 'react';
import {
  derive, sumTotals, metaCampaignTotals, fmtMoney, fmtInt, fmtRate, fmtCount, ratio, fmtFrequency,
} from '../../../shared/utils/trafficMetrics';
import { AudienceTag, Delta, Icon, Note, Segmented } from './ui';

function eventCount(row, step, which) {
  const totals = which === 'cur' ? row.cur : row.prev;
  if (!totals) return null;
  if (row.platform === 'all') {
    const parts = which === 'cur' ? row.parts : row.prevParts;
    const values = ['meta', 'google']
      .filter(platform => step[platform] && parts?.[platform])
      .map(platform => parts[platform].conversions?.[step[platform]] || 0);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }
  const key = step[row.platform];
  return key ? totals.conversions?.[key] || 0 : null;
}

const LPV = 'landing_page_view';

/**
 * Campos só do Meta (o Google não mede): alcance vem pronto da API para o conjunto da
 * linha; frequência = impressões do Meta ÷ alcance; visualizações da página de destino
 * são somáveis. Nas linhas do Google ficam null ("—").
 */
function metaOnly(totals, prevTotals, reach, prevReach) {
  return {
    reach: totals ? reach ?? null : null,
    prevReach: prevTotals ? prevReach ?? null : null,
    metaImpressions: totals?.impressions ?? null,
    prevMetaImpressions: prevTotals?.impressions ?? null,
    lpv: totals ? totals.conversions?.[LPV] || 0 : null,
    prevLpv: prevTotals ? prevTotals.conversions?.[LPV] || 0 : null,
  };
}

function buildRows(m, reachKey) {
  const groupReach = m.metaReach?.current?.[reachKey] ?? null;
  const prevGroupReach = m.metaReach?.previous?.[reachKey] ?? null;

  const prevGoogle = new Map(m.prev.google.map(c => [c.key, c]));
  const prevMeta = new Map(m.prev.meta.filter(c => !c.boosted).map(c => [c.key, c]));

  const googleChildren = m.googleOk ? [...m.cur.google].sort((a, b) => b.spend - a.spend).map(campaign => {
    const prev = prevGoogle.get(campaign.key);
    const prevAds = new Map((prev?.ads || []).map(ad => [ad.id, ad]));
    return {
      key: campaign.key, level: 2, label: campaign.name, platform: 'google', audience: campaign.audience,
      cur: campaign, prev: prev || null,
      children: [...campaign.ads].sort((a, b) => b.spend - a.spend).map(ad => ({
        key: `${campaign.key}:${ad.id}`, level: 3, label: ad.name, platform: 'google', cur: ad, prev: prevAds.get(ad.id) || null, children: [],
      })),
    };
  }) : [];

  const metaChildren = m.metaOk ? m.cur.meta.filter(c => !c.boosted).map(campaign => {
    const prev = prevMeta.get(campaign.key);
    const prevAds = new Map((prev?.ads || []).map(ad => [ad.id, ad]));
    return {
      key: campaign.key, level: 2, label: campaign.name, platform: 'meta', audience: campaign.audience,
      cur: metaCampaignTotals(campaign), prev: prev ? metaCampaignTotals(prev) : null,
      ...metaOnly(metaCampaignTotals(campaign), prev ? metaCampaignTotals(prev) : null, campaign.reach, prev?.reach),
      children: [...campaign.ads].sort((a, b) => b.spend - a.spend).map(ad => {
        const prevAd = prevAds.get(ad.id) || null;
        return {
          key: `${campaign.key}:${ad.id}`, level: 3, label: ad.name, platform: 'meta', cur: ad, prev: prevAd,
          ...metaOnly(ad, prevAd, ad.reach, prevAd?.reach), children: [],
        };
      }),
    };
  }).sort((a, b) => b.cur.spend - a.cur.spend) : [];

  const googleTotals = m.googleOk ? sumTotals(m.cur.google) : null;
  const prevGoogleTotals = m.googleOk ? sumTotals(m.prev.google) : null;
  const metaTotals = m.metaOk ? m.totals.metaAds : null;
  const prevMetaTotals = m.metaOk ? m.prevTotals.metaAds : null;

  const channels = [];
  if (m.hasGoogle) channels.push({ key: 'ch:google', level: 1, label: 'Google Ads', platform: 'google', cur: googleTotals, prev: prevGoogleTotals, children: googleChildren });
  const metaFields = metaOnly(metaTotals, prevMetaTotals, groupReach, prevGroupReach);
  if (m.hasMeta) channels.push({ key: 'ch:meta', level: 1, label: 'Meta', platform: 'meta', cur: metaTotals, prev: prevMetaTotals, ...metaFields, children: metaChildren });

  const total = m.allOk ? sumTotals([googleTotals, metaTotals].filter(Boolean)) : null;
  const prevTotal = m.allOk ? sumTotals([prevGoogleTotals, prevMetaTotals].filter(Boolean)) : null;
  return {
    key: 'total', level: 0, label: 'Total', platform: 'all',
    cur: total, prev: prevTotal,
    // No Total, alcance, frequência e página de destino são só do Meta.
    ...(m.hasMeta && total ? metaFields : metaOnly(null, null)),
    parts: { meta: metaTotals, google: googleTotals },
    prevParts: { meta: prevMetaTotals, google: prevGoogleTotals },
    children: channels,
  };
}

function MetricCell({ value, delta }) {
  return <td><div className="tr-cell"><span>{value}</span>{delta}</div></td>;
}

function Row({ row, steps, open, toggle, audiences }) {
  const cur = row.cur ? derive(row.cur) : null;
  const prev = row.prev ? derive(row.prev) : null;
  const frequency = ratio(row.metaImpressions, row.reach);
  const prevFrequency = ratio(row.prevMetaImpressions, row.prevReach);
  const isOpen = open.has(row.key);
  const hasChildren = row.children.length > 0;
  return (
    <>
      <tr className={`tr-lvl-${row.level}`}>
        <td>
          <div className="tr-name" style={{ paddingLeft: row.level * 14 }}>
            {hasChildren
              ? <button type="button" className={`tr-tree-btn${isOpen ? ' is-open' : ''}`} onClick={() => toggle(row.key)} aria-expanded={isOpen} aria-label={isOpen ? 'Recolher' : 'Expandir'}><Icon.ChevronRight /></button>
              : <span style={{ width: 20, flex: 'none' }} />}
            <span className="tr-name-text">
              {row.label}
              {row.level === 2 && <> <AudienceTag audiences={audiences} id={row.audience} /></>}
            </span>
          </div>
        </td>
        <MetricCell value={fmtMoney(cur?.spend)} delta={<Delta metric="spend" current={cur?.spend} previous={prev?.spend} />} />
        <MetricCell value={fmtInt(row.reach)} delta={<Delta metric="reach" current={row.reach} previous={row.prevReach} />} />
        <MetricCell value={fmtFrequency(frequency)} delta={<Delta metric="frequency" current={frequency} previous={prevFrequency} />} />
        <MetricCell value={fmtInt(cur?.impressions)} delta={<Delta metric="impressions" current={cur?.impressions} previous={prev?.impressions} />} />
        <MetricCell value={fmtMoney(cur?.cpm)} delta={<Delta metric="cpm" current={cur?.cpm} previous={prev?.cpm} />} />
        <MetricCell value={fmtInt(cur?.clicks)} delta={<Delta metric="clicks" current={cur?.clicks} previous={prev?.clicks} />} />
        <MetricCell value={fmtRate(cur?.ctr)} delta={<Delta metric="ctr" kind="pp" current={cur?.ctr} previous={prev?.ctr} />} />
        <MetricCell value={fmtMoney(cur?.cpc)} delta={<Delta metric="cpc" current={cur?.cpc} previous={prev?.cpc} />} />
        <MetricCell value={fmtInt(row.lpv)} delta={<Delta metric="landingPageViews" current={row.lpv} previous={row.prevLpv} />} />
        {steps.map(step => {
          const count = eventCount(row, step, 'cur');
          const prevCount = eventCount(row, step, 'prev');
          const cost = ratio(cur?.spend, count);
          return (
            <MetricCell
              key={step.label}
              value={count === null ? '—' : `${fmtCount(count)} · ${fmtMoney(cost)}`}
              delta={<Delta metric="conversions" current={count} previous={prevCount} />}
            />
          );
        })}
      </tr>
      {isOpen && row.children.map(child => (
        <Row key={child.key} row={child} steps={steps} open={open} toggle={toggle} audiences={audiences} />
      ))}
    </>
  );
}

export default function CampaignsTab({ m, onPlatform }) {
  const audiences = m.audiences.length ? m.audiences : [{ id: 'geral', label: 'Conversões' }];
  const [audienceId, setAudienceId] = useState(audiences[0].id);
  const [open, setOpen] = useState(() => new Set(['total', 'ch:google', 'ch:meta']));
  const steps = (m.funnels[audienceId] || []).filter(step => step.label && (step.meta || step.google)).slice(0, 3);
  // Só as campanhas do funil escolhido: gasto, cliques e conversões não se misturam.
  const view = m.byAudience[audienceId];
  const reachKey = m.audiences.length ? `aud:${audienceId}` : 'ads';
  const tree = useMemo(() => buildRows({ ...m, ...view }, reachKey), [m, view, reachKey]);
  const audienceLabel = audiences.find(a => a.id === audienceId)?.label;

  const toggle = (key) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <>
      <div className="tr-row tr-noprint" style={{ marginBottom: 16, gap: 12 }}>
        {onPlatform && (
          <Segmented
            label="Plataforma"
            options={[
              { id: 'all', label: 'Ambas' },
              { id: 'meta', label: 'Meta', disabled: !m.platformAccounts.meta, title: m.platformAccounts.meta ? undefined : 'Nenhuma conta Meta neste relatório' },
              { id: 'google', label: 'Google', disabled: !m.platformAccounts.google, title: m.platformAccounts.google ? undefined : 'Nenhuma conta Google neste relatório' },
            ]}
            value={m.platform}
            onChange={onPlatform}
          />
        )}
        {m.audiences.length > 1 && <Segmented label="Funil" options={audiences} value={audienceId} onChange={setAudienceId} />}
      </div>
      {m.audiences.length > 0 && (
        <Note>
          Mostrando só as campanhas do funil {audienceLabel}.
          {m.unassigned.count > 0 && ` ${m.unassigned.count} campanha${m.unassigned.count > 1 ? 's' : ''} com gasto no período (${fmtMoney(m.unassigned.spend)}) não ${m.unassigned.count > 1 ? 'estão' : 'está'} em nenhum funil e ${m.unassigned.count > 1 ? 'ficam' : 'fica'} de fora; ajuste em Configurar.`}
        </Note>
      )}
      <div className="tr-table-box">
        <table className="tr-table">
          <thead>
            <tr>
              <th>Campanha / anúncio</th>
              <th>Gasto</th>
              <th>Alcance</th>
              <th>Frequência</th>
              <th>Impressões</th>
              <th>CPM</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>CPC</th>
              <th>Visualizações da página de destino</th>
              {steps.map(step => <th key={step.label}>{step.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <Row row={tree} steps={steps} open={open} toggle={toggle} audiences={m.audiences} />
          </tbody>
        </table>
      </div>
      {m.hasMeta && <Note>Alcance, frequência e visualizações da página de destino só existem no Meta: nas linhas do Google aparecem como “—” e o Total mostra o número do Meta. Alcance conta pessoas únicas no período, sem somar campanhas.</Note>}
      {!steps.length && <Note>Nenhum evento de funil configurado para este funil; as colunas de conversão ficam ocultas.</Note>}
    </>
  );
}
