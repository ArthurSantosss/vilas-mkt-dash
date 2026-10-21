import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PRESETS, PLATFORMS, presetRange, matchPreset, previousRange, todayIn, daysBetween, readPlatform,
  rangeTouchesToday, fmtDayMonth, fmtUpdatedAt, buildTrafficModel,
} from '../../../shared/utils/trafficMetrics';
import { getAgencyLabel } from '../../../shared/utils/agencyLogo';
import DateRangePicker from './DateRangePicker';
import OverviewTab from './OverviewTab';
import CampaignsTab from './CampaignsTab';
import AuctionTab from './AuctionTab';
import FollowersTab from './FollowersTab';
import PostsTab from './PostsTab';
import { Icon, Segmented } from './ui';
import './traffic-report.css';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

const TABS = [
  { id: 'visao-geral', label: 'Visão geral', title: 'Visão geral', Component: OverviewTab },
  { id: 'campanhas', label: 'Campanhas', title: 'Campanhas', Component: CampaignsTab },
  { id: 'leilao', label: 'Leilão Google', title: 'Leilão Google', Component: AuctionTab, needs: 'google' },
  { id: 'seguidores', label: 'Seguidores', title: 'Seguidores', Component: FollowersTab, needs: 'meta' },
  { id: 'posts', label: 'Posts', title: 'Posts', Component: PostsTab, needs: 'instagram' },
];

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`O servidor não respondeu como esperado (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(json.details ? `${json.error} ${json.details}` : json.error || `Erro HTTP ${res.status}`);
  return json;
}

function readRange(params, today) {
  const start = params.get('inicio');
  const end = params.get('fim');
  if (YMD.test(start || '') && YMD.test(end || '') && start <= end && end <= today && daysBetween(start, end) < MAX_DAYS) {
    return { start, end };
  }
  return presetRange('last7', today);
}

/** Avisa o que ainda não está fechado quando o período inclui o dia de hoje. */
function TodayNotice({ m, todayOnly }) {
  return (
    <div className="tr-warn">
      <p className="tr-warn-title"><Icon.Clock />Dia de hoje em andamento: os números mudam ao longo do dia e a página busca de novo a cada 5 minutos.</p>
      <ul>
        {todayOnly && <li>A comparação é com o dia de ontem inteiro, então a variação tende a parecer pior até o fim do dia.</li>}
        {!todayOnly && <li>O período anterior está completo e o atual ainda não, então a variação tende a parecer pior até o fim do dia.</li>}
        {m.hasMeta && <li>Meta: gasto, impressões, cliques e conversões de hoje chegam com atraso e ainda podem ser revisados pela plataforma.</li>}
        {m.hasGoogle && <li>Google Ads: os números de hoje aparecem com algumas horas de atraso; parcela de impressões e taxas de topo podem ficar vazias (“—”) até o dia seguinte.</li>}
        {m.hasInstagram && <li>Instagram: seguidores ganhos hoje só são liberados amanhã; visualizações e interações de hoje são parciais.</li>}
      </ul>
    </div>
  );
}

/**
 * source: { shareKey } no link do cliente, ou { configId } dentro da plataforma.
 * embedded: dentro do painel (sem fundo de página inteira).
 */
export default function TrafficReport({ source, share = null, embedded = false, toolbar = null }) {
  const sourceKey = source.configId ? `config:${source.configId}` : `share:${source.shareKey}`;
  const [params, setParams] = useSearchParams();
  const today = todayIn();
  const range = readRange(params, today);
  const prevRange = previousRange(range);
  const activePreset = matchPreset(range, today);
  const platform = readPlatform(params.get('plataforma'));
  const live = rangeTouchesToday(range, today);
  const [printing, setPrinting] = useState(false);

  const query = source.configId
    ? `action=report&configId=${encodeURIComponent(source.configId)}&inicio=${range.start}&fim=${range.end}`
    : `shareId=${encodeURIComponent(source.shareKey)}&inicio=${range.start}&fim=${range.end}`;
  const core = useQuery({
    queryKey: ['traffic-report', sourceKey, range.start, range.end, 'core'],
    queryFn: () => getJson(`/api/traffic-report?${query}&secao=core`),
    staleTime: 60_000,
    // Período com hoje: busca de novo a cada 5 min (mesmo prazo do cache do servidor).
    refetchInterval: live ? 5 * 60_000 : false,
    retry: 1,
  });
  const hasInstagram = Boolean(core.data?.hasInstagram);
  const instagram = useQuery({
    queryKey: ['traffic-report', sourceKey, range.start, range.end, 'instagram'],
    queryFn: () => getJson(`/api/traffic-report?${query}&secao=instagram`),
    enabled: hasInstagram && platform !== 'google',
    staleTime: 60_000,
    refetchInterval: live ? 5 * 60_000 : false,
    retry: 1,
  });

  const igLoading = hasInstagram && platform !== 'google' && instagram.isLoading;
  const ig = useMemo(() => (instagram.error
    ? { available: false, reason: `Não foi possível ler o Instagram: ${instagram.error.message}` }
    : instagram.data?.instagram || null), [instagram.error, instagram.data]);

  const model = useMemo(() => (core.data ? buildTrafficModel(core.data, ig, igLoading, platform) : null), [core.data, ig, igLoading, platform]);

  const visibleTabs = TABS.filter(tab => {
    if (!model) return tab.id === 'visao-geral';
    if (tab.needs === 'google') return model.hasGoogle;
    if (tab.needs === 'meta') return model.hasMeta || model.hasInstagram;
    if (tab.needs === 'instagram') return model.hasInstagram && ig?.available !== false;
    return true;
  });
  const tabId = visibleTabs.some(t => t.id === params.get('aba')) ? params.get('aba') : 'visao-geral';
  const activeTab = visibleTabs.find(t => t.id === tabId) || visibleTabs[0];

  const clientLabel = core.data?.clientLabel || share?.client_label || 'Relatório';
  const agencyLabel = getAgencyLabel(null, core.data?.agency || share?.agency || 'vilasmkt');

  useEffect(() => {
    if (!embedded) document.title = `${clientLabel} · Relatório de Tráfego Pago`;
  }, [clientLabel, embedded]);

  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('tr-printing');
    const done = () => {
      document.body.classList.remove('tr-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => setTimeout(() => window.print(), 50));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('tr-printing');
    };
  }, [printing]);

  const setRange = (next) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('inicio', next.start);
    nextParams.set('fim', next.end);
    setParams(nextParams);
  };

  const setPlatform = (id) => {
    const nextParams = new URLSearchParams(params);
    if (id === 'all') nextParams.delete('plataforma'); else nextParams.set('plataforma', id);
    nextParams.set('inicio', range.start);
    nextParams.set('fim', range.end);
    setParams(nextParams);
  };

  const tabHref = (id) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('inicio', range.start);
    nextParams.set('fim', range.end);
    nextParams.set('aba', id);
    return `?${nextParams.toString()}`;
  };

  const span = (r) => (r.start === r.end ? fmtDayMonth(r.start) : `${fmtDayMonth(r.start)}–${fmtDayMonth(r.end)}`);
  const periodText = `${span(range)}${range.start === today ? ' (hoje)' : ''} comparado a ${span(prevRange)}`;
  const platformLabel = model?.canFilterPlatform && platform !== 'all' ? PLATFORMS.find(p => p.id === platform).label : null;

  return (
    <div className={`tr${embedded ? ' tr-embedded' : ''}`}>
      <div className="tr-wrap">
        {toolbar && <div className="tr-noprint">{toolbar}</div>}
        <header className="tr-hero">
          <div>
            <p className="tr-eyebrow">{agencyLabel} · Relatório de Tráfego Pago</p>
            <h1 className="tr-client">{clientLabel}</h1>
            <p className="tr-hero-period">{periodText}{platformLabel ? ` · somente ${platformLabel}` : ''}</p>
          </div>
          <button
            type="button"
            className="tr-btn tr-btn-primary tr-noprint"
            onClick={() => setPrinting(true)}
            disabled={!model || igLoading || printing}
          >
            <Icon.Download />
            Exportar PDF
          </button>
        </header>

        <nav className="tr-tabs tr-noprint" aria-label="Seções do relatório">
          {visibleTabs.map(tab => (
            <Link key={tab.id} to={tabHref(tab.id)} className={`tr-tab${tab.id === activeTab.id ? ' is-active' : ''}`} aria-current={tab.id === activeTab.id ? 'page' : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="tr-controls tr-noprint">
          {model?.canFilterPlatform && (
            <Segmented label="Plataforma" options={PLATFORMS} value={platform} onChange={setPlatform} />
          )}
          <Segmented
            label="Atalhos de período"
            options={PRESETS}
            value={activePreset}
            onChange={(id) => setRange(presetRange(id, today))}
          />
          <DateRangePicker key={`${range.start}|${range.end}`} value={range} today={today} onApply={setRange} />
          <span className="tr-spacer" />
          {core.data?.fetchedAt && <span className="tr-badge">Dados atualizados até {fmtUpdatedAt(core.data.fetchedAt)}</span>}
        </div>

        {model && live && <TodayNotice m={model} todayOnly={range.start === today} />}

        {core.isLoading && <div className="tr-loading"><span className="tr-spin" />Buscando dados nas plataformas…</div>}
        {core.error && (
          <div className="tr-alert">
            <p>Não foi possível carregar o relatório: {core.error.message}</p>
            <button type="button" className="tr-btn" style={{ marginTop: 10 }} onClick={() => core.refetch()}>Tentar novamente</button>
          </div>
        )}

        {model && model.failures.length > 0 && (
          <div className="tr-alert">
            {model.failures.map(text => <p key={text}>Conta sem resposta — {text}</p>)}
            <p>Os números dessa plataforma aparecem como “—” até a conta voltar a responder.</p>
          </div>
        )}

        {model && !printing && (
          <section key={activeTab.id}>
            <h2 className="tr-title">{activeTab.title}</h2>
            <activeTab.Component m={model} onPlatform={setPlatform} />
          </section>
        )}

        {model && printing && visibleTabs.map(tab => (
          <section className="tr-page" key={tab.id}>
            <h2 className="tr-title">{tab.title}</h2>
            <tab.Component m={model} />
          </section>
        ))}
      </div>
    </div>
  );
}
