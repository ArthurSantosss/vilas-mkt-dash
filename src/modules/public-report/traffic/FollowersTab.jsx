import { fmtMoney, fmtInt, fmtDDMMYY, ratio, todayIn, conversionCount, truncateText as truncate } from '../../../shared/utils/trafficMetrics';
import { Delta, Icon, Note, Stat } from './ui';

// Conversas por mensagem iniciadas a partir dos anúncios (janela de 7 dias do Meta).
const CONVERSATIONS = 'onsite_conversion.messaging_conversation_started_7d';

const isoToYmd = (iso) => (iso ? todayIn(undefined, new Date(iso)) : null);

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
    ? m.cur.meta.filter(c => c.boosted).flatMap(c => c.ads.map(ad => ({ ...ad, campaign: c })))
      .sort((a, b) => b.spend - a.spend)
    : [];

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
            </tr>
          </thead>
          <tbody>
            {boosted.map(ad => {
              const start = isoToYmd(ad.campaign.startTime || ad.createdTime);
              const caption = truncate(ad.post?.caption || ad.name);
              return (
                <tr key={ad.id}>
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
                </tr>
              );
            })}
            {!boosted.length && (
              <tr><td colSpan={6} className="tr-empty">{m.metaOk ? 'Nenhum post turbinado com veiculação no período.' : '— A conta do Meta não respondeu.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </>
  );
}
