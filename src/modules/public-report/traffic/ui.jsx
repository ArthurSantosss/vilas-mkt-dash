import { compare, toneFor, deltaText } from '../../../shared/utils/trafficMetrics';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

// eslint-disable-next-line react-refresh/only-export-components
export const Icon = {
  Calendar: () => (
    <svg viewBox="0 0 24 24" className="tr-icon" aria-hidden="true" {...stroke}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  ChevronLeft: () => <svg viewBox="0 0 24 24" className="tr-icon" aria-hidden="true" {...stroke}><path d="M15 6l-6 6 6 6" /></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" className="tr-icon" aria-hidden="true" {...stroke}><path d="M9 6l6 6-6 6" /></svg>,
  Download: () => (
    <svg viewBox="0 0 24 24" className="tr-icon" aria-hidden="true" {...stroke}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
    </svg>
  ),
  External: () => (
    <svg viewBox="0 0 24 24" className="tr-icon" style={{ width: 12, height: 12 }} aria-hidden="true" {...stroke}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" className="tr-icon" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
  ),
  Info: () => (
    <svg viewBox="0 0 24 24" className="tr-icon" style={{ width: 14, height: 14, marginTop: 1 }} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" />
    </svg>
  ),
};

/** Pílula de variação. kind 'pp' para taxas (fração), 'pct' para o resto. */
export function Delta({ metric, current, previous, kind = 'pct' }) {
  const comparison = compare(current, previous, kind);
  const tone = toneFor(metric, comparison);
  return <span className={`tr-pill ${tone}`}>{deltaText(comparison, kind)}</span>;
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="tr-seg" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'is-active' : ''}
          aria-pressed={value === option.id}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Note({ children }) {
  if (!children) return null;
  return <p className="tr-note"><Icon.Info /><span>{children}</span></p>;
}

export function Stat({ label, value, delta, note, big = false }) {
  return (
    <div className="tr-card">
      <p className="tr-label">{label}</p>
      <p className={big ? 'tr-big' : 'tr-mid'}>{value}</p>
      {delta}
      <Note>{note}</Note>
    </div>
  );
}

export function AudienceTag({ audiences, id }) {
  const index = audiences.findIndex(a => a.id === id);
  if (index < 0) return null;
  return <span className={`tr-tag ${index === 0 ? 'a0' : index === 1 ? 'a1' : 'plain'}`}>{audiences[index].label}</span>;
}
