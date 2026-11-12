import { memo, useEffect, useRef, useState } from 'react';
import { Check, X, RefreshCw, CalendarClock, Pencil } from 'lucide-react';
import { getDaysUntil, formatDateBR, formatDateInput } from '../utils/nextPayment';

/** Próxima data de pagamento: calculada (último pagamento + frequência) ou definida manualmente. */
const NextPaymentEditor = memo(function NextPaymentEditor({ accountId, computedDate, overrideDate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const effectiveDate = overrideDate || computedDate;
  const days = getDaysUntil(effectiveDate);
  const overdue = days !== null && days < 0;
  const soon = days !== null && days >= 0 && days <= 2;
  const color = overdue ? 'text-danger' : soon ? 'text-warning' : 'text-primary-light';
  const label = days === null
    ? ''
    : overdue
      ? `Atrasado ${Math.abs(days)}d`
      : days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days}d`;

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleOpen = (e) => {
    e?.stopPropagation();
    setDraft(overrideDate ? formatDateInput(overrideDate) : computedDate ? formatDateInput(computedDate) : '');
    setEditing(true);
  };

  const handleSave = (e) => {
    e?.stopPropagation();
    onSave(accountId, draft || null);
    setEditing(false);
  };

  const handleCancel = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onSave(accountId, null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          className="bg-bg border border-primary/40 rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
        />
        <button onClick={handleSave} className="p-0.5 rounded hover:bg-success/20 text-success transition-colors" title="Salvar">
          <Check size={12} />
        </button>
        <button onClick={handleCancel} className="p-0.5 rounded hover:bg-danger/20 text-danger transition-colors" title="Cancelar">
          <X size={12} />
        </button>
        {overrideDate && (
          <button onClick={handleClear} className="p-0.5 rounded hover:bg-warning/20 text-warning transition-colors" title="Limpar override (voltar ao cálculo automático)">
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    );
  }

  if (!effectiveDate) {
    return (
      <button
        onClick={handleOpen}
        className="text-xs text-text-secondary/60 hover:text-primary-light transition-colors"
        title="Definir próxima data de pagamento"
      >
        Definir
      </button>
    );
  }

  return (
    <button
      onClick={handleOpen}
      title={overrideDate ? 'Data manual — clique para alterar' : 'Calculado automaticamente — clique para definir manualmente'}
      className="group inline-flex items-center gap-1 hover:bg-primary/5 rounded px-1.5 py-0.5 transition-colors"
    >
      <CalendarClock size={11} className={color} />
      <span className="flex flex-col items-end leading-tight">
        <span className={`font-medium ${color}`}>
          {formatDateBR(effectiveDate)}
          {overrideDate && <span className="ml-1 text-[9px] text-primary-light/70 font-normal">manual</span>}
        </span>
        <span className={`text-[10px] opacity-70 ${color}`}>{label}</span>
      </span>
      <Pencil size={10} className="opacity-0 group-hover:opacity-60 text-text-secondary transition-opacity" />
    </button>
  );
});

export default NextPaymentEditor;
