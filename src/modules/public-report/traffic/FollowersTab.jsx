import { fmtMoney, fmtInt, fmtDDMMYY, ratio, todayIn, conversionCount, truncateText as truncate } from '../../../shared/utils/trafficMetrics';
import { Delta, Icon, Note, Stat } from './ui';

// Conversas por mensagem iniciadas a partir dos anúncios (janela de 7 dias do Meta).
const CONVERSATIONS = 'onsite_conversion.messaging_conversation_started_7d';

const isoToYmd = (iso) => (iso ? todayIn(undefined, new Date(iso)) : null);

/** Junta anúncios do mesmo post: os seguidores são do post, então não podem repetir por anúncio. */
function groupByPost(ads) {
  const byPost = new Map();
  for (const ad of ads) {
    const key = ad.post?.mediaId || ad.id;
    const start = ad.campaign.startTime || ad.createdTime || null;
    const existing = byPost.get(key);
    if (!existing) {
      byPost.set(key, {
        key, name: ad.name, post: ad.post, startTime: start, spend: ad.spend, profileVisits: ad.profileVisits ?? null, impressions: ad.impressions ?? 0, reach: ad.reach, follows: ad.post?.follows ?? null,
        status: ad.status ?? null, stopTime: ad.stopTime ?? null, lastDelivery: ad.lastDelivery ?? null,
      });
      continue;
    }
    // Post com vários anúncios: fica ativo se qualquer um estiver; "ativo até" é a última veiculação.
    if (ad.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      existing.status = ad.status;
      existing.stopTime = ad.stopTime ?? null;
    }
    if (ad.lastDelivery && (!existing.lastDelivery || ad.lastDelivery > existing.lastDelivery)) existing.lastDelivery = ad.lastDelivery;
    existing.spend += ad.spend;
    existing.impressions += ad.impressions ?? 0;
    if (ad.profileVisits != null) existing.profileVisits = (existing.profileVisits ?? 0) + ad.profileVisits;
    existing.reach = null; // alcance é de pessoas únicas: não dá para somar entre anúncios
    if (start && (!existing.startTime || start < existing.startTime)) existing.startTime = start;
  }
  return [...byPost.values()];
}

/**
 * A API do Instagram não libera "follows" de Reels. Para esses posts, reparte os seguidores
 * ganhos pelo perfil no período na proporção das impressões de cada post turbinado (a fatia
 * dos posts com número real fica com eles). Sem o total do perfil (períodos com mais de 30
 * dias), usa as visitas ao perfil × a taxa de seguidores por visita dos posts com número real.
 */
function estimateFollows(posts, accountFollowers) {
  const totalImpressions = posts.reduce((sum, post) => sum + post.impressions, 0);
  const real = posts.filter(post => post.follows != null && post.profileVisits > 0);
  const realVisits = real.reduce((sum, post) => sum + post.profileVisits, 0);
  const rate = realVisits ? real.reduce((sum, post) => sum + post.follows, 0) / realVisits : null;
  return posts.map(post => {
    if (post.follows != null) return { ...post, followsEstimated: false };
    let follows = null;
    if (accountFollowers != null && totalImpressions) follows = accountFollowers * post.impressions / totalImpressions;
    else if (rate != null && post.profileVisits != null) follows = post.profileVisits * rate;
    return follows == null
      ? { ...post, followsEstimated: false }
      : { ...post, follows: Math.round(follows), followsEstimated: true };
  });
}

const INACTIVE_LABELS = {
  PAUSED: 'Pausado',
  CAMPAIGN_PAUSED: 'Pausado',
  ADSET_PAUSED: 'Pausado',
  DISAPPROVED: 'Reprovado',
  PENDING_REVIEW: 'Em análise',
  IN_PROCESS: 'Em análise',
  WITH_ISSUES: 'Com problemas',
  ARCHIVED: 'Arquivado',
  DELETED: 'Excluído',
};

function BoostStatus({ post }) {
  if (!post.status) return '—';
  const ended = post.stopTime && new Date(post.stopTime) < new Date();
  if (post.status === 'ACTIVE' && !ended) {
    const until = post.stopTime ? isoToYmd(post.stopTime) : null;
    return (
      <>
        <span className="tr-pill good">Ativo</span>
        {until && <div className="tr-muted">programado até {fmtDDMMYY(until)}</div>}
      </>
    );
  }
  const label = ended ? 'Encerrado' : INACTIVE_LABELS[post.status] || 'Inativo';
  return (
    <>
      <span className="tr-pill neutral">{label}</span>
      <div className="tr-muted">{post.lastDelivery ? `ativo até ${fmtDDMMYY(post.lastDelivery)}` : 'sem veiculação'}</div>
    </>
  );
}

export default function FollowersTab({ m }) {
  const metaSpend = m.metaOk ? m.totals.meta.spend : null;
  const prevMetaSpend = m.metaOk ? m.prevTotals.meta.spend : null;
  const boostedSpend = m.metaOk ? m.totals.metaBoosted.spend : null;
  const prevBoostedSpend = m.metaOk ? m.prevTotals.metaBoosted.spend : null;

  const followers = m.ig?.followers?.current?.value ?? null;
  const prevFollowers = m.ig?.followers?.previous?.value ?? null;
  const followersNote = m.igLoading
    ? 'Carregando dados do Instagram…'
    : !m.hasInstagram
      ? 'Nenhuma conta do Instagram vinculada a este relatório.'
      : m.ig?.available === false ? m.ig.reason : m.ig?.followers?.current?.note;
  const costPerFollower = ratio(metaSpend, followers);

  const igNote = (metric) => (m.igLoading
    ? 'Carregando dados do Instagram…'
    : !m.hasInstagram
      ? 'Nenhuma conta do Instagram vinculada a este relatório.'
      : m.ig?.available === false ? m.ig.reason : metric?.note);
  const profileViews = m.ig?.profileViews || null;
  const bioClicks = m.ig?.bioLinkClicks || null;
  const conversations = m.metaOk ? conversionCount(m.totals.meta, CONVERSATIONS) : null;
  const prevConversations = m.metaOk ? conversionCount(m.prevTotals.meta, CONVERSATIONS) : null;

  const boosted = m.metaOk
    ? estimateFollows(groupByPost(m.cur.meta.filter(c => c.boosted).flatMap(c => c.ads.map(ad => ({ ...ad, campaign: c })))), followers)
      .sort((a, b) => b.spend - a.spend)
    : [];
  const anyEstimated = boosted.some(post => post.followsEstimated);
  const approx = (estimated, text) => (estimated && text !== '—' ? `≈ ${text}` : text);
  const boostedFollows = boosted.some(post => post.follows != null)
    ? boosted.reduce((sum, post) => sum + (post.follows ?? 0), 0)
    : null;
  const boostedFollowsSpend = boosted.filter(post => post.follows != null).reduce((sum, post) => sum + post.spend, 0);
  const boostedVisits = boosted.some(post => post.profileVisits != null)
    ? boosted.reduce((sum, post) => sum + (post.profileVisits ?? 0), 0)
    : null;
  const boostedVisitsSpend = boosted.filter(post => post.profileVisits != null).reduce((sum, post) => sum + post.spend, 0);

  return (
    <>
      <div className="tr-grid tr-grid-4">
        <Stat label="Seguidores ganhos" value={fmtInt(followers)} big
          delta={<Delta metric="followers" current={followers} previous={prevFollowers} />} note={followersNote} />
        <Stat label="Custo por seguidor" value={fmtMoney(costPerFollower)} big
          delta={<Delta metric="costPerFollower" current={costPerFollower} previous={ratio(prevMetaSpend, prevFollowers)} />} />
        <Stat label="Gasto total no Meta" value={fmtMoney(metaSpend)} big
          delta={<Delta metric="spend" current={metaSpend} previous={prevMetaSpend} />} />
        <Stat label="Gasto em posts turbinados" value={fmtMoney(boostedSpend)} big
          delta={<Delta metric="spend" current={boostedSpend} previous={prevBoostedSpend} />} />
      </div>
      <div className="tr-grid tr-grid-4 tr-section">
        <Stat label="Visitas ao perfil" value={fmtInt(profileViews?.current)} big
          delta={<Delta metric="profileViews" current={profileViews?.current} previous={profileViews?.previous} />} note={igNote(profileViews)} />
        <Stat label="Cliques no link da bio" value={fmtInt(bioClicks?.current)} big
          delta={<Delta metric="bioLinkClicks" current={bioClicks?.current} previous={bioClicks?.previous} />} note={igNote(bioClicks)} />
        <Stat label="Conversas iniciadas" value={fmtInt(conversations)} big
          delta={<Delta metric="conversations" current={conversations} previous={prevConversations} />}
          note={m.metaOk ? 'Conversas por mensagem iniciadas pelos anúncios do Meta.' : 'A conta do Meta não respondeu.'} />
        <Stat label="Custo por conversa" value={fmtMoney(ratio(metaSpend, conversations))} big
          delta={<Delta metric="costPerConversation" current={ratio(metaSpend, conversations)} previous={ratio(prevMetaSpend, prevConversations)} />}
          note="Gasto total no Meta ÷ conversas iniciadas." />
      </div>
      <Note>A API do Instagram só libera seguidores por dia dos últimos 30 dias. Para períodos que começam antes disso, o número aparece como “—”.</Note>

      <h2 className="tr-subtitle" style={{ marginTop: 32, marginBottom: 12 }}>Posts turbinados no período</h2>
      <div className="tr-table-box">
        <table className="tr-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Início do boost</th>
              <th>Status</th>
              <th>Gasto</th>
              <th>Alcance</th>
              <th>Visitas ao perfil</th>
              <th>Custo por visita ao perfil</th>
              <th>Seguidores</th>
              <th>Custo por seguidor</th>
            </tr>
          </thead>
          <tbody>
            {boosted.map(ad => {
              const start = isoToYmd(ad.startTime);
              const caption = truncate(ad.post?.caption || ad.name);
              return (
                <tr key={ad.key}>
                  <td>
                    <span className="tr-name">
                      {ad.post?.permalink
                        ? <a className="tr-name-text" href={ad.post.permalink} target="_blank" rel="noreferrer">{caption} <Icon.External /></a>
                        : <span className="tr-name-text">{caption}</span>}
                    </span>
                  </td>
                  <td>{start ? fmtDDMMYY(start) : '—'}</td>
                  <td><BoostStatus post={ad} /></td>
                  <td>{fmtMoney(ad.spend)}</td>
                  <td>{fmtInt(ad.reach)}</td>
                  <td>{fmtInt(ad.profileVisits)}</td>
                  <td>{fmtMoney(ratio(ad.spend, ad.profileVisits))}</td>
                  <td>{approx(ad.followsEstimated, fmtInt(ad.follows))}</td>
                  <td>{approx(ad.followsEstimated, fmtMoney(ratio(ad.spend, ad.follows)))}</td>
                </tr>
              );
            })}
            {!boosted.length && (
              <tr><td colSpan={9} className="tr-empty">{m.metaOk ? 'Nenhum post turbinado com veiculação no período.' : '— A conta do Meta não respondeu.'}</td></tr>
            )}
            {boosted.length > 1 && (
              <tr>
                <td><strong>Total</strong></td>
                <td />
                <td />
                <td>{fmtMoney(boosted.reduce((sum, post) => sum + post.spend, 0))}</td>
                <td>—</td>
                <td>{fmtInt(boostedVisits)}</td>
                <td>{fmtMoney(ratio(boostedVisitsSpend, boostedVisits))}</td>
                <td>{approx(anyEstimated, fmtInt(boostedFollows))}</td>
                <td>{approx(anyEstimated, fmtMoney(ratio(boostedFollowsSpend, boostedFollows)))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Note>Seguidores = contas que passaram a seguir o perfil a partir do post (dado do Instagram, somando orgânico e pago, desde a publicação). Custo por seguidor = gasto do boost no período ÷ seguidores do post. Visitas ao perfil = visitas ao perfil do Instagram vindas do anúncio no período (dado do Meta Ads). A API do Instagram não libera seguidores de Reels: nesses posts o número marcado com “≈” é uma estimativa, que reparte os seguidores ganhos pelo perfil no período entre os posts turbinados na proporção das impressões de cada um.</Note>

    </>
  );
}
