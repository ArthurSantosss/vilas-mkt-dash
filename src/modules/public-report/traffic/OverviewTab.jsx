import { fmtMoney, fmtCount, fmtRate, fmtInt, ratio, funnelSteps, spendFor } from '../../../shared/utils/trafficMetrics';
import { Delta, Note } from './ui';

const PLATFORM_LABEL = { meta: 'Meta', google: 'Google' };
// Cada etapa estreita 20% da largura; a borda de baixo de uma encosta no topo da próxima.
// O recuo lateral do texto (% da largura do funil) acompanha a inclinação.
const STEP_SHRINK = 20;

function FunnelStep({ step, prev, index, prevStep, spend, prevSpend, platformSpend }) {
  const width = 100 - index * STEP_SHRINK;
  const inset = ((STEP_SHRINK / 2) / width) * 100;
  const cost = ratio(spend, step.total);
  const prevCost = ratio(prevSpend, prev?.total);
  const pass = prevStep ? ratio(step.total, prevStep.total) : null;
  // Com uma plataforma só, o número dela já é o da etapa: mostra só o nome do evento.
  const platforms = Object.entries(step.byPlatform);
  return (
    <>
      {prevStep && (
        <p className="tr-fpass">
          {pass === null ? '—' : fmtRate(pass)} <span>avançaram de {prevStep.label}</span>
        </p>
      )}
      <div
        className={`tr-fshape s${Math.min(index, 2)}`}
        style={{ width: `${width}%`, clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`, paddingInline: `${STEP_SHRINK / 2 + 2}%` }}
      >
        <span className="tr-fstep-label"><span className="tr-fnum">{index + 1}</span>{step.label}</span>
        <span className="tr-fvalue">
          {fmtCount(step.total)}
          <Delta metric="conversions" current={step.total} previous={prev?.total} />
        </span>
      </div>
      <div className="tr-fdetail">
        <span className="tr-row" style={{ justifyContent: 'center' }}>
          <span>Custo por conversão <strong>{fmtMoney(cost)}</strong></span>
          <Delta metric="costPer" current={cost} previous={prevCost} />
        </span>
        {platforms.length === 1 && (
          <span className="tr-platform-line">{PLATFORM_LABEL[platforms[0][0]]} · {platforms[0][1].label}</span>
        )}
        {platforms.length > 1 && platforms.map(([platform, data]) => (
          <span className="tr-platform-line" key={platform}>
            <span>{PLATFORM_LABEL[platform]} · {data.label}:</span>
            <strong>{fmtCount(data.value)}</strong>
            <span>· {fmtMoney(ratio(platformSpend[platform], data.value))} cada</span>
            <Delta metric="conversions" current={data.value} previous={prev?.byPlatform?.[platform]?.value} />
          </span>
        ))}
      </div>
    </>
  );
}

function FunnelCard({ audience, index, steps, prevSteps, spend, prevSpend, platformSpend, scoped }) {
  const first = steps[0]?.total;
  const last = steps[steps.length - 1]?.total;
  return (
    <div className={`tr-card tr-funnel f${Math.min(index, 2)}`}>
      <div className="tr-funnel-head">
        <span className="tr-dot" />
        <h3 className="tr-subtitle">Funil {audience.label}</h3>
      </div>
      <p className="tr-funnel-spend">
        {scoped ? 'Gasto das campanhas deste funil' : 'Gasto considerado'}: <strong>{fmtMoney(spend)}</strong>
        <Delta metric="spend" current={spend} previous={prevSpend} />
      </p>
      {!steps.length && <p className="tr-muted">Nenhum evento configurado para este funil nesta plataforma.</p>}
      <div className="tr-funnel-body">
        {steps.map((step, i) => (
          <FunnelStep
            key={step.label}
            step={step}
            prev={prevSteps[i]}
            index={i}
            prevStep={i > 0 ? steps[i - 1] : null}
            spend={spend}
            prevSpend={prevSpend}
            platformSpend={platformSpend}
          />
        ))}
      </div>
      {steps.length > 1 && (
        <p className="tr-funnel-foot">
          Da 1ª à última etapa: <strong>{fmtRate(ratio(last, first))}</strong>
        </p>
      )}
    </div>
  );
}

export default function OverviewTab({ m }) {
  const { totals: t, prevTotals: p } = m;
  const both = m.hasMeta && m.hasGoogle;
  const channel = both ? 'all' : m.hasMeta ? 'meta' : 'google';
  const metaSpend = m.metaOk ? t.meta.spend : null;
  const prevMetaSpend = m.metaOk ? p.meta.spend : null;

  const totalSpend = m.allOk ? t.all.spend : null;
  const prevTotalSpend = m.allOk ? p.all.spend : null;
  const spendTitle = both ? 'Gasto total Google + Meta' : m.hasMeta ? 'Gasto total no Meta' : 'Gasto total no Google Ads';

  const followers = m.ig?.followers?.current?.value ?? null;
  const prevFollowers = m.ig?.followers?.previous?.value ?? null;
  const followersNote = m.igLoading
    ? 'Carregando dados do Instagram…'
    : !m.hasInstagram
      ? 'Nenhuma conta do Instagram vinculada a este relatório.'
      : m.ig?.available === false ? m.ig.reason : m.ig?.followers?.current?.note;
  const costPerFollower = ratio(metaSpend, followers);
  const prevCostPerFollower = ratio(prevMetaSpend, prevFollowers);

  const audiences = m.audiences.length ? m.audiences : [{ id: 'geral', label: 'Conversões' }];
  const status = { metaOk: m.metaOk, googleOk: m.googleOk };

  const metaSplit = (
    <>
      <div className="tr-between tr-muted" style={{ marginTop: 12 }}>
        <span>Anúncios: <strong style={{ color: '#fff' }}>{fmtMoney(m.metaOk ? t.metaAds.spend : null)}</strong></span>
        <Delta metric="spend" current={m.metaOk ? t.metaAds.spend : null} previous={m.metaOk ? p.metaAds.spend : null} />
      </div>
      <div className="tr-between tr-muted" style={{ marginTop: 6 }}>
        <span>Posts turbinados: <strong style={{ color: '#fff' }}>{fmtMoney(m.metaOk ? t.metaBoosted.spend : null)}</strong></span>
        <Delta metric="spend" current={m.metaOk ? t.metaBoosted.spend : null} previous={m.metaOk ? p.metaBoosted.spend : null} />
      </div>
    </>
  );

  return (
    <>
      <div className="tr-card tr-card-dark">
        <p className="tr-label">{spendTitle}</p>
        <p className="tr-big tr-big-xl">{fmtMoney(totalSpend)}</p>
        <Delta metric="spend" current={totalSpend} previous={prevTotalSpend} />
        {!m.allOk && <Note>Uma das contas não respondeu, então o total ficaria incompleto. Veja o aviso no topo.</Note>}
        {both && (
          <div className="tr-grid tr-grid-2" style={{ marginTop: 20 }}>
            <div className="tr-sub">
              <p className="tr-label">Google Ads · todas as campanhas</p>
              <p className="tr-mid">{fmtMoney(m.googleOk ? t.google.spend : null)}</p>
              <Delta metric="spend" current={m.googleOk ? t.google.spend : null} previous={m.googleOk ? p.google.spend : null} />
            </div>
            <div className="tr-sub">
              <p className="tr-label">Meta</p>
              <p className="tr-mid">{fmtMoney(metaSpend)}</p>
              <Delta metric="spend" current={metaSpend} previous={prevMetaSpend} />
              {metaSplit}
            </div>
          </div>
        )}
        {!both && m.hasMeta && <div className="tr-sub" style={{ marginTop: 20 }}>{metaSplit}</div>}
      </div>

      {m.hasMeta && (
        <div className="tr-card tr-section">
          <div className="tr-grid tr-grid-2">
            <div>
              <p className="tr-label">Seguidores ganhos</p>
              <p className="tr-big">{fmtInt(followers)}</p>
              <Delta metric="followers" current={followers} previous={prevFollowers} />
              <Note>{followersNote}</Note>
            </div>
            <div>
              <p className="tr-label">Custo por seguidor</p>
              <p className="tr-big">{fmtMoney(costPerFollower)}</p>
              <Delta metric="costPerFollower" current={costPerFollower} previous={prevCostPerFollower} />
              <Note>Gasto total no Meta ÷ seguidores ganhos no período.</Note>
            </div>
          </div>
        </div>
      )}

      <div className="tr-between" style={{ marginTop: 40 }}>
        <h2 className="tr-subtitle tr-subtitle-lg">Funis</h2>
      </div>
      {m.audiences.length > 0 && (
        <Note>
          Cada funil conta só o gasto e as conversões das campanhas ligadas a ele.
          {m.unassigned.count > 0 && ` ${m.unassigned.count} campanha${m.unassigned.count > 1 ? 's' : ''} com gasto no período (${fmtMoney(m.unassigned.spend)}) não ${m.unassigned.count > 1 ? 'estão' : 'está'} em nenhum funil.`}
        </Note>
      )}
      <div className={`tr-grid ${audiences.length > 1 ? 'tr-grid-2' : ''} tr-section`}>
        {audiences.map((audience, index) => {
          const view = m.byAudience[audience.id];
          return (
            <FunnelCard
              key={audience.id}
              audience={audience}
              index={index}
              scoped={m.audiences.length > 0}
              steps={funnelSteps(m.funnels[audience.id], view.totals, channel, status)}
              prevSteps={funnelSteps(m.funnels[audience.id], view.prevTotals, channel, status)}
              spend={m.allOk ? spendFor(view.totals, channel) : null}
              prevSpend={m.allOk ? spendFor(view.prevTotals, channel) : null}
              platformSpend={{ meta: m.metaOk ? view.totals.meta.spend : null, google: m.googleOk ? view.totals.google.spend : null }}
            />
          );
        })}
      </div>
    </>
  );
}
