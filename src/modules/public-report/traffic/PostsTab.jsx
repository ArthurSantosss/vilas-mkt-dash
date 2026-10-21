import { fmtInt, fmtRate, fmtSeconds, fmtDDMM, ratio, todayIn, truncateText as truncate } from '../../../shared/utils/trafficMetrics';
import { Delta, Icon, Note, Stat } from './ui';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function engagement(post) {
  const parts = [post.likes, post.comments, post.saves, post.shares];
  return parts.every(isNum) ? parts.reduce((a, b) => a + b, 0) : null;
}

export default function PostsTab({ m }) {
  if (m.igLoading) return <div className="tr-loading"><span className="tr-spin" />Carregando dados do Instagram…</div>;
  const ig = m.ig;
  const cur = ig?.profile?.current || null;
  const prev = ig?.profile?.previous || null;
  const boostedMedia = new Set(m.cur.meta.flatMap(c => c.ads).map(ad => ad.post?.mediaId).filter(Boolean));
  const posts = [...(ig?.posts || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <>
      <div className="tr-grid tr-grid-5">
        <Stat label="Visualizações" value={fmtInt(cur?.views)} delta={<Delta metric="views" current={cur?.views} previous={prev?.views} />} />
        <Stat label="Interações" value={fmtInt(cur?.interactions)} delta={<Delta metric="interactions" current={cur?.interactions} previous={prev?.interactions} />} />
        <Stat label="Salvamentos" value={fmtInt(cur?.saves)} delta={<Delta metric="saves" current={cur?.saves} previous={prev?.saves} />} />
        <Stat label="Compartilhamentos" value={fmtInt(cur?.shares)} delta={<Delta metric="shares" current={cur?.shares} previous={prev?.shares} />} />
        <Stat label="Interações por visualização" value={fmtRate(ratio(cur?.interactions, cur?.views))}
          delta={<Delta metric="interactionsPerView" kind="pp" current={ratio(cur?.interactions, cur?.views)} previous={ratio(prev?.interactions, prev?.views)} />} />
      </div>
      <Note>{ig?.profile?.note}</Note>

      <h2 className="tr-subtitle" style={{ marginTop: 32, marginBottom: 12 }}>Posts publicados no período{ig?.username ? ` · @${ig.username}` : ''}</h2>
      <div className="tr-table-box">
        <table className="tr-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Alcance</th>
              <th>Visualizações</th>
              <th>Engajamento</th>
              <th>Taxa de engajamento</th>
              <th>Salvamentos</th>
              <th>Compartilhamentos</th>
              <th>Tempo médio assistido</th>
              <th>Pularam nos 3s</th>
            </tr>
          </thead>
          <tbody>
            {posts.map(post => {
              const isReel = post.productType === 'REELS';
              const eng = engagement(post);
              return (
                <tr key={post.id}>
                  <td>
                    <span className="tr-name">
                      <span>
                        {post.permalink
                          ? <a className="tr-name-text" href={post.permalink} target="_blank" rel="noreferrer">{truncate(post.caption, 60)} <Icon.External /></a>
                          : <span className="tr-name-text">{truncate(post.caption, 60)}</span>}
                        <span className="tr-row" style={{ marginTop: 4 }}>
                          <span className="tr-muted">{fmtDDMM(todayIn(undefined, new Date(post.timestamp)))}{isReel ? ' · Reel' : ''}</span>
                          {boostedMedia.has(post.id) && <span className="tr-tag a1">Turbinado</span>}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>{fmtInt(post.reach)}</td>
                  <td>{fmtInt(post.views)}</td>
                  <td>{fmtInt(eng)}</td>
                  <td>{fmtRate(ratio(eng, post.reach))}</td>
                  <td>{fmtInt(post.saves)}</td>
                  <td>{fmtInt(post.shares)}</td>
                  <td>{isReel ? fmtSeconds(post.avgWatchTimeMs) : '—'}</td>
                  <td>{isReel && isNum(post.skipRate) ? fmtRate(post.skipRate / 100) : '—'}</td>
                </tr>
              );
            })}
            {!posts.length && <tr><td colSpan={9} className="tr-empty">{ig?.postsNote || 'Nenhum post publicado no período.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {posts.length > 0 && <Note>{ig?.postsNote}</Note>}

    </>
  );
}
