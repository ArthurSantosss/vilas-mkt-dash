import { useEffect, useRef, useState } from 'react';
import { MONTH_NAMES, addDays, fmtDDMMYY, fmtDayMonth } from '../../../shared/utils/trafficMetrics';
import { Icon } from './ui';

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
// A Meta guarda insights por até 37 meses; antes disso não há o que mostrar.
const HISTORY_DAYS = 37 * 30;

function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return cells;
}

export default function DateRangePicker({ value, today, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ start: value.start, end: value.end });
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => ({ year: Number(value.end.slice(0, 4)), month: Number(value.end.slice(5, 7)) - 1 }));
  const ref = useRef(null);
  const minDate = addDays(today, -HISTORY_DAYS);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const esc = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setDraft({ start: value.start, end: value.end });
      setView({ year: Number(value.end.slice(0, 4)), month: Number(value.end.slice(5, 7)) - 1 });
    }
    setOpen(!open);
  };

  const pick = (day) => {
    // 1º clique define o início; 2º clique define o fim.
    if (!draft.start || draft.end) {
      setDraft({ start: day, end: null });
    } else if (day < draft.start) {
      setDraft({ start: day, end: draft.start });
    } else {
      setDraft({ start: draft.start, end: day });
    }
  };

  const shift = (delta) => {
    const date = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  };

  const rangeEnd = draft.end || (draft.start && hover && hover >= draft.start ? hover : null);
  const todayMonth = today.slice(0, 7);
  const viewMonth = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;

  return (
    <div className="tr-cal-anchor" ref={ref}>
      <button type="button" className="tr-btn" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        <Icon.Calendar />
        {fmtDDMMYY(value.start)} – {fmtDDMMYY(value.end)}
      </button>
      {open && (
        <div className="tr-cal" role="dialog" aria-label="Escolher período">
          <div className="tr-cal-head">
            <button type="button" className="tr-cal-nav" onClick={() => shift(-1)} disabled={viewMonth <= minDate.slice(0, 7)} aria-label="Mês anterior"><Icon.ChevronLeft /></button>
            <span>{MONTH_NAMES[view.month]} {view.year}</span>
            <button type="button" className="tr-cal-nav" onClick={() => shift(1)} disabled={viewMonth >= todayMonth} aria-label="Próximo mês"><Icon.ChevronRight /></button>
          </div>
          <div className="tr-cal-grid" onMouseLeave={() => setHover(null)}>
            {DOW.map((d, i) => <span key={i} className="tr-cal-dow">{d}</span>)}
            {monthGrid(view.year, view.month).map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const disabled = day > today || day < minDate;
              const isEdge = day === draft.start || day === draft.end;
              const inRange = draft.start && rangeEnd && day > draft.start && day < rangeEnd;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  className={`tr-cal-day${isEdge ? ' is-edge' : ''}${inRange ? ' in-range' : ''}`}
                  onClick={() => pick(day)}
                  onMouseEnter={() => setHover(day)}
                  title={disabled && day > today ? 'Dia futuro' : undefined}
                >
                  {Number(day.slice(8, 10))}
                </button>
              );
            })}
          </div>
          <p className="tr-cal-hint">
            {draft.start && draft.end
              ? `${fmtDayMonth(draft.start)} – ${fmtDayMonth(draft.end)}`
              : draft.start ? 'Agora escolha o dia final.' : 'Escolha o dia inicial.'}
          </p>
          <div className="tr-cal-actions">
            <button type="button" className="tr-btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button
              type="button"
              className="tr-btn tr-btn-primary"
              disabled={!draft.start || !draft.end}
              onClick={() => { onApply({ start: draft.start, end: draft.end }); setOpen(false); }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
