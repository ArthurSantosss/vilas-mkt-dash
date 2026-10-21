import { derive, fmtMoney, fmtRate } from '../../../shared/utils/trafficMetrics';
import { Delta, Note } from './ui';

function Bar({ row }) {
  if (row.impressionShare === null) {
    return <Note>O Google não informou a parcela de impressões desta campanha no período (costuma acontecer com pouco volume).</Note>;
  }
  const parts = [
    { cls: 'won', value: row.impressionShare || 0, label: 'Ganhas' },
    { cls: 'budget', value: row.budgetLost || 0, label: 'Perdidas por orçamento' },
    { cls: 'rank', value: row.rankLost || 0, label: 'Perdidas por classificação' },
  ];
  return (
    <>
      <div className="tr-bar" role="img" aria-label={parts.map(p => `${p.label} ${fmtRate(p.value)}`).join(', ')}>
        {parts.map(p => <span key={p.cls} className={p.cls} style={{ width: `${Math.max(0, p.value) * 100}%` }} />)}
      </div>
      <div className="tr-legend">
        {parts.map(p => <span key={p.cls}><i className={`tr-bar-${p.cls}`} style={{ background: p.cls === 'won' ? 'var(--tr-teal)' : p.cls === 'budget' ? 'var(--tr-purple)' : '#F79009' }} />{p.label}: {fmtRate(p.value)}</span>)}
      </div>
    </>
  );
}

function Cell({ value, delta }) {
  return <td><div className="tr-cell"><span>{value}</span>{delta}</div></td>;
}

export default function AuctionTab({ m }) {
  if (!m.googleOk) {
    return <div className="tr-card"><p className="tr-empty">—</p><Note>A conta do Google Ads não respondeu. Veja o aviso no topo.</Note></div>;
  }
  const prevByKey = new Map(m.prev.auction.map(row => [row.key, row]));
  const rows = [...m.cur.auction].sort((a, b) => b.spend - a.spend);

  return (
    <>
      {!rows.length && <div className="tr-card"><p className="tr-empty">Nenhuma campanha de Pesquisa teve impressões no período.</p></div>}
      <div className="tr-grid tr-grid-2">
        {rows.map(row => (
          <div className="tr-card" key={row.key}>
            <p className="tr-label">{row.name}</p>
            <div className="tr-row">
              <span className="tr-mid">{fmtRate(row.impressionShare)}</span>
              <Delta metric="impressionShare" kind="pp" current={row.impressionShare} previous={prevByKey.get(row.key)?.impressionShare} />
            </div>
            <Bar row={row} />
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="tr-table-box tr-section">
          <table className="tr-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Parcela de impressões</th>
                <th>Perdida por orçamento</th>
                <th>Perdida por classificação</th>
                <th>Taxa no topo</th>
                <th>Taxa na 1ª posição</th>
                <th>CPC médio</th>
                <th>CTR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const prev = prevByKey.get(row.key) || null;
                const cur = derive(row);
                const old = prev ? derive(prev) : null;
                return (
                  <tr key={row.key}>
                    <td><span className="tr-name"><span className="tr-name-text">{row.name}</span></span></td>
                    <Cell value={fmtRate(row.impressionShare)} delta={<Delta metric="impressionShare" kind="pp" current={row.impressionShare} previous={prev?.impressionShare} />} />
                    <Cell value={fmtRate(row.budgetLost)} delta={<Delta metric="budgetLost" kind="pp" current={row.budgetLost} previous={prev?.budgetLost} />} />
                    <Cell value={fmtRate(row.rankLost)} delta={<Delta metric="rankLost" kind="pp" current={row.rankLost} previous={prev?.rankLost} />} />
                    <Cell value={fmtRate(row.topRate)} delta={<Delta metric="topRate" kind="pp" current={row.topRate} previous={prev?.topRate} />} />
                    <Cell value={fmtRate(row.absTopRate)} delta={<Delta metric="absTopRate" kind="pp" current={row.absTopRate} previous={prev?.absTopRate} />} />
                    <Cell value={fmtMoney(cur.cpc)} delta={<Delta metric="cpc" current={cur.cpc} previous={old?.cpc} />} />
                    <Cell value={fmtRate(cur.ctr)} delta={<Delta metric="ctr" kind="pp" current={cur.ctr} previous={old?.ctr} />} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </>
  );
}
