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
      byPost.set(key, { key, name: ad.name, post: ad.post, startTime: start, spend: ad.spend, clicks: ad.clicks, reach: ad.reach, follows: ad.post?.follows ?? null });
      continue;
    }
    existing.spend += ad.spend;
    existing.clicks += ad.clicks;
    existing.reach = null; // alcance é de pessoas únicas: não dá para somar entre anúncios
    if (start && (!existing.startTime || start < existing.startTime)) existing.startTime = start;
  }
  return [...byPost.values()];
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
    ? groupByPost(m.cur.meta.filter(c => c.boosted).flatMap(c => c.ads.map(ad => ({ ...ad, campaign: c }))))
      .sort((a, b) => b.spend - a.spend)
    : [];
  const boostedFollows = boosted.some(post => post.follows != null)
    ? boosted.reduce((sum, post) => sum + (post.follows ?? 0), 0)
    : null;
  const boostedFollowsSpend = boosted.filter(post => post.follows != null).reduce((sum, post) => sum + post.spend, 0);

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
              <th>Gasto</th>
              <th>Alcance</th>
              <th>Cliques</th>
              <th>Custo por clique</th>
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
                  <td>{fmtMoney(ad.spend)}</td>
                  <td>{fmtInt(ad.reach)}</td>
                  <td>{fmtInt(ad.clicks)}</td>
                  <td>{fmtMoney(ratio(ad.spend, ad.clicks))}</td>
                  <td>{fmtInt(ad.follows)}</td>
                  <td>{fmtMoney(ratio(ad.spend, ad.follows))}</td>
                </tr>
              );
            })}
            {!boosted.length && (
              <tr><td colSpan={8} className="tr-empty">{m.metaOk ? 'Nenhum post turbinado com veiculação no período.' : '— A conta do Meta não respondeu.'}</td></tr>
            )}
            {boosted.length > 1 && (
              <tr>
                <td><strong>Total</strong></td>
                <td />
                <td>{fmtMoney(boosted.reduce((sum, post) => sum + post.spend, 0))}</td>
                <td>—</td>
                <td>{fmtInt(boosted.reduce((sum, post) => sum + post.clicks, 0))}</td>
                <td>{fmtMoney(ratio(boosted.reduce((sum, post) => sum + post.spend, 0), boosted.reduce((sum, post) => sum + post.clicks, 0)))}</td>
                <td>{fmtInt(boostedFollows)}</td>
                <td>{fmtMoney(ratio(boostedFollowsSpend, boostedFollows))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Note>Seguidores = contas que passaram a seguir o perfil a partir do post (dado do Instagram, somando orgânico e pago, desde a publicação). Custo por seguidor = gasto do boost no período ÷ seguidores do post. Posts que o Instagram não libera (ex.: alguns Reels) aparecem como “—”.</Note>

    </>
  );
}
