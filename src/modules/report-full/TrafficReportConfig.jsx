import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X, Check, RefreshCw, Plus, Trash2, Search } from 'lucide-react';
import { useAgency } from '../../contexts/AgencyContext';
import { saveTrafficConfig, fetchTrafficOptions } from './trafficReportApi';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';

const DEFAULT_AUDIENCES = [{ id: 'comprador', label: 'Comprador' }, { id: 'vendedor', label: 'Vendedor' }];
const EMPTY_STEPS = () => [0, 1, 2].map(() => ({ label: '', meta: '', google: '', metaLabel: '', googleLabel: '' }));

const input = 'w-full rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-primary/40 focus:outline-none';
const sectionTitle = 'mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary';

function slugId(label, taken) {
  const base = String(label || 'publico').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'publico';
  let id = base;
  let n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

// Todo relatório tem ao menos um funil nomeado; o padrão são Comprador e Vendedor.
function normalizeInitial(initial) {
  const config = initial || {};
  const saved = Array.isArray(config.audiences) ? config.audiences : [];
  const audiences = saved.length ? saved : DEFAULT_AUDIENCES;
  const funnels = {};
  audiences.forEach((audience, index) => {
    // Configurações antigas com funil único ("geral") viram o primeiro funil.
    const source = config.funnels?.[audience.id] || (!saved.length && index === 0 ? config.funnels?.geral : null);
    const steps = Array.isArray(source) ? source : [];
    funnels[audience.id] = EMPTY_STEPS().map((empty, i) => ({ ...empty, ...(steps[i] || {}) }));
  });
  return {
    id: config.id || null,
    name: config.name || '',
    agency: config.agency || '',
    metaAccounts: Array.isArray(config.metaAccounts) ? config.metaAccounts : [],
    googleAccounts: Array.isArray(config.googleAccounts) ? config.googleAccounts : [],
    instagramUserId: config.instagramUserId || '',
    audiences,
    funnels,
    campaignAudience: config.campaignAudience || {},
    boostedOverride: config.boostedOverride || {},
  };
}

function AccountPicker({ title, accounts, selected, onToggle }) {
  const [search, setSearch] = useState('');
  const list = accounts.filter(a => !search || a.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <p className={sectionTitle}>{title} ({selected.length})</p>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input className={`${input} pl-8`} placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-bg/30 p-2">
        {list.map(account => (
          <label key={account.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-text-primary hover:bg-bg/60">
            <input type="checkbox" checked={selected.includes(account.id)} onChange={() => onToggle(account.id)} />
            <span className="truncate">{account.label}</span>
            <span className="ml-auto text-[11px] text-text-secondary">{account.id}</span>
          </label>
        ))}
        {!list.length && <p className="px-2 py-1 text-xs text-text-secondary">Nenhuma conta encontrada.</p>}
      </div>
    </div>
  );
}

export default function TrafficReportConfig({ initial = null, onClose, onSaved }) {
  const meta = useMetaAds();
  const google = useGoogleAds();
  const { agencies } = useAgency();
  const [config, setConfig] = useState(() => normalizeInitial(initial));
  const [options, setOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const metaAccounts = useMemo(() => meta.accounts.map(a => ({ id: a.id, label: a.clientName || a.id })), [meta.accounts]);
  const googleAccounts = useMemo(() => google.accounts.map(a => ({ id: a.accountId, label: a.clientName || a.accountId })), [google.accounts]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError(null);
    try {
      const params = { meta: config.metaAccounts.join(','), google: config.googleAccounts.join(',') };
      setOptions(await fetchTrafficOptions(params));
    } catch (err) {
      setError(`Erro ao carregar campanhas e eventos: ${err.message}`);
    } finally {
      setLoadingOptions(false);
    }
  }, [config.metaAccounts, config.googleAccounts]);

  // Carrega uma vez ao abrir; depois só pelo botão (as contas podem mudar).
  useEffect(() => { loadOptions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (field, id) => setConfig(prev => ({
    ...prev,
    [field]: prev[field].includes(id) ? prev[field].filter(x => x !== id) : [...prev[field], id],
  }));

  const funnelIds = config.audiences.length ? config.audiences.map(a => a.id) : ['geral'];

  const setAudiences = (audiences) => setConfig(prev => {
    const ids = audiences.length ? audiences.map(a => a.id) : ['geral'];
    const funnels = Object.fromEntries(ids.map(id => [id, prev.funnels[id] || EMPTY_STEPS()]));
    const campaignAudience = Object.fromEntries(Object.entries(prev.campaignAudience).filter(([, value]) => audiences.some(a => a.id === value)));
    return { ...prev, audiences, funnels, campaignAudience };
  });

  const updateStep = (funnelId, index, patch) => setConfig(prev => ({
    ...prev,
    funnels: { ...prev.funnels, [funnelId]: prev.funnels[funnelId].map((step, i) => (i === index ? { ...step, ...patch } : step)) },
  }));

  // Conversões personalizadas primeiro (inclusive sem disparo ainda), depois os demais eventos do Meta.
  const metaCustom = useMemo(() => {
    const map = new Map();
    for (const account of options?.meta || []) for (const item of account.customConversions || []) if (!map.has(item.key)) map.set(item.key, item);
    return [...map.values()];
  }, [options]);
  const metaEvents = useMemo(() => {
    const map = new Map();
    for (const item of metaCustom) map.set(item.key, item.label);
    for (const account of options?.meta || []) for (const event of account.events || []) if (!map.has(event.key)) map.set(event.key, event.label);
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [options, metaCustom]);
  const metaOtherEvents = metaEvents.filter(ev => !metaCustom.some(item => item.key === ev.key));
  const googleEvents = useMemo(() => {
    const map = new Map();
    for (const account of options?.google || []) for (const event of account.events || []) if (!map.has(event.key)) map.set(event.key, event.label);
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [options]);
  const campaigns = useMemo(() => [
    ...(options?.google || []).flatMap(a => a.campaigns.map(c => ({ ...c, platform: 'Google' }))),
    ...(options?.meta || []).flatMap(a => a.campaigns.map(c => ({ ...c, platform: 'Meta' }))),
  ].sort((a, b) => b.spend - a.spend), [options]);
  const optionErrors = [...(options?.meta || []), ...(options?.google || [])].filter(a => a.error);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const clean = {
        ...config,
        instagramUserId: config.instagramUserId.trim() || null,
        funnels: Object.fromEntries(funnelIds.map(id => [id, (config.funnels[id] || []).map(step => ({
          label: step.label.trim(),
          meta: step.meta || null,
          google: step.google || null,
          metaLabel: step.meta ? (step.metaLabel || step.meta) : null,
          googleLabel: step.google ? (step.googleLabel || step.google) : null,
        }))])),
      };
      const saved = await saveTrafficConfig(clean);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold text-text-primary">{config.id ? 'Editar relatório completo' : 'Novo relatório completo'}</h2>
            <p className="mt-1 text-xs text-text-secondary">O cliente só vê as contas marcadas aqui. Tudo é lido ao vivo das plataformas.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-text-secondary hover:bg-bg/60 hover:text-text-primary"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className={sectionTitle}>Nome do cliente</p>
              <input className={input} placeholder="Ex.: Consórcio Market" value={config.name}
                onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <p className={sectionTitle}>Agência</p>
              <select className={input} value={config.agency} onChange={e => setConfig(prev => ({ ...prev, agency: e.target.value }))}>
                <option value="">Vilas MKT (padrão)</option>
                {agencies.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AccountPicker title="Contas Meta" accounts={metaAccounts} selected={config.metaAccounts} onToggle={id => toggleIn('metaAccounts', id)} />
            <AccountPicker title="Contas Google Ads" accounts={googleAccounts} selected={config.googleAccounts} onToggle={id => toggleIn('googleAccounts', id)} />
          </div>
          <button type="button" onClick={loadOptions} disabled={loadingOptions}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-light hover:bg-primary/15 disabled:opacity-50">
            {loadingOptions ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Carregar campanhas e eventos das contas marcadas (últimos 90 dias)
          </button>
          {optionErrors.map(a => <p key={a.accountId} className="text-xs text-danger">Conta {a.accountId}: {a.error}</p>)}

          <div>
            <p className={sectionTitle}>Instagram (abas Seguidores e Posts)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <select className={input} value={config.instagramUserId} onChange={e => setConfig(prev => ({ ...prev, instagramUserId: e.target.value }))}>
                <option value="">Sem Instagram</option>
                {(options?.instagramAccounts || []).map(ig => <option key={ig.id} value={ig.id}>@{ig.username}</option>)}
                {config.instagramUserId && !(options?.instagramAccounts || []).some(ig => ig.id === config.instagramUserId) && (
                  <option value={config.instagramUserId}>ID {config.instagramUserId}</option>
                )}
              </select>
              <input className={input} placeholder="Ou cole o ID da conta do Instagram" value={config.instagramUserId}
                onChange={e => setConfig(prev => ({ ...prev, instagramUserId: e.target.value.replace(/\D/g, '') }))} />
            </div>
          </div>

          <div>
            <p className={sectionTitle}>Funis (até 3 etapas cada, um evento por plataforma)</p>
            {!options && <p className="mb-2 text-xs text-text-secondary">Carregue as campanhas e eventos para escolher os eventos de conversão.</p>}
            <div className="space-y-4">
              {config.audiences.map((audience, audienceIndex) => (
                <div key={audience.id} className="rounded-xl border border-border bg-bg/30 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">Funil</span>
                    <input className={`${input} max-w-xs`} value={audience.label} placeholder="Nome do funil (ex.: Comprador)"
                      onChange={e => setAudiences(config.audiences.map((a, i) => (i === audienceIndex ? { ...a, label: e.target.value } : a)))} />
                    {config.audiences.length > 1 && (
                      <button type="button" title="Remover funil" onClick={() => setAudiences(config.audiences.filter((_, i) => i !== audienceIndex))}
                        className="ml-auto rounded-lg p-2 text-text-secondary hover:bg-danger/15 hover:text-danger"><Trash2 size={14} /></button>
                    )}
                  </div>
                  {(config.funnels[audience.id] || EMPTY_STEPS()).map((step, index) => (
                    <div key={index} className="mb-2 grid gap-2 md:grid-cols-3">
                      <input className={input} placeholder={`Etapa ${index + 1} (nome que o cliente vê)`} value={step.label}
                        onChange={e => updateStep(audience.id, index, { label: e.target.value })} />
                      <select className={input} value={step.meta || ''} onChange={e => {
                        const label = metaEvents.find(ev => ev.key === e.target.value)?.label || e.target.value;
                        updateStep(audience.id, index, { meta: e.target.value, metaLabel: label, ...(!step.label.trim() && e.target.value ? { label } : {}) });
                      }}>
                        <option value="">Meta: sem evento</option>
                        {step.meta && !metaEvents.some(ev => ev.key === step.meta) && <option value={step.meta}>{step.metaLabel || step.meta}</option>}
                        {metaCustom.length > 0 && (
                          <optgroup label="Meta · conversões personalizadas">
                            {metaCustom.map(item => (
                              <option key={item.key} value={item.key}>
                                {item.label}{item.eventName && item.eventName !== item.label ? ` (${item.eventName})` : ''}{item.archived ? ' · arquivada' : ''}{item.count ? ` · ${item.count} em 90 dias` : ' · sem disparo em 90 dias'}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {metaOtherEvents.length > 0 && (
                          <optgroup label="Meta · outros eventos">
                            {metaOtherEvents.map(ev => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <select className={input} value={step.google || ''} onChange={e => updateStep(audience.id, index, {
                        google: e.target.value, googleLabel: e.target.value,
                        ...(!step.label.trim() && e.target.value ? { label: e.target.value } : {}),
                      })}>
                        <option value="">Google: sem evento</option>
                        {step.google && !googleEvents.some(ev => ev.key === step.google) && <option value={step.google}>{step.google}</option>}
                        {googleEvents.map(ev => <option key={ev.key} value={ev.key}>Google: {ev.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
              {config.audiences.length < 4 && (
                <button type="button" onClick={() => setAudiences([...config.audiences, { id: slugId('Novo funil', config.audiences.map(a => a.id)), label: 'Novo funil' }])}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-light"><Plus size={14} /> Adicionar funil</button>
              )}
            </div>
          </div>

          {campaigns.length > 0 && (
            <div>
              <p className={sectionTitle}>Campanhas ({campaigns.length})</p>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-bg/30 p-2">
                {campaigns.map(campaign => {
                  const boosted = typeof config.boostedOverride[campaign.key] === 'boolean' ? config.boostedOverride[campaign.key] : Boolean(campaign.boosted);
                  return (
                    <div key={campaign.key} className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg/60">
                      <span className="rounded bg-bg/60 px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">{campaign.platform}</span>
                      <span className="min-w-0 flex-1 truncate text-text-primary" title={campaign.name}>{campaign.name}</span>
                      {campaign.platform === 'Meta' && (
                        <label className="flex items-center gap-1 text-xs text-text-secondary" title="Posts turbinados saem da aba Campanhas e vão para Seguidores">
                          <input type="checkbox" checked={boosted}
                            onChange={e => setConfig(prev => ({ ...prev, boostedOverride: { ...prev.boostedOverride, [campaign.key]: e.target.checked } }))} />
                          Post turbinado
                        </label>
                      )}
                      {config.audiences.length > 0 && (
                        <select className="rounded-lg border border-border bg-bg/40 px-2 py-1 text-xs text-text-primary"
                          value={config.campaignAudience[campaign.key] || ''}
                          onChange={e => setConfig(prev => {
                            const next = { ...prev.campaignAudience };
                            if (e.target.value) next[campaign.key] = e.target.value; else delete next[campaign.key];
                            return { ...prev, campaignAudience: next };
                          })}>
                          <option value="">Sem funil</option>
                          {config.audiences.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving || !config.name.trim() || (!config.metaAccounts.length && !config.googleAccounts.length)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar configuração
          </button>
        </div>
      </div>
    </div>
  );
}
