import { useState } from 'react';
import { Check, X, Pencil, Trash2 } from 'lucide-react';
import { saveGoogleManualBalance } from '../utils/googleBalance';
import { formatDateBR, formatDateInput, parseDateInput } from '../utils/nextPayment';
import { formatCurrency } from '../utils/format';

/**
 * Informa o saldo pré-pago de uma conta Google (a API não expõe Pix/boleto).
 * O saldo atual = valor informado − gasto real feito depois da data informada.
 */
export default function GoogleBalanceEditor({ accountId, manual, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  const open = (event) => {
    event?.stopPropagation();
    setAmount(manual ? String(manual.amount).replace('.', ',') : '');
    setDate(manual?.date || formatDateInput(new Date()));
    setEditing(true);
  };
  // "1.234,56" (BR) ou "1234.56": com vírgula, pontos são milhar.
  const rawAmount = String(amount).trim().replace(/^R\$\s*/i, '');
  const parsedAmount = Number(rawAmount.includes(',') ? rawAmount.replace(/\./g, '').replace(',', '.') : rawAmount);
  const valid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount >= 0 && Boolean(parseDateInput(date));
  const save = (event) => {
    event?.stopPropagation();
    if (!valid) return;
    saveGoogleManualBalance(accountId, { amount: parsedAmount, date });
    setEditing(false);
  };
  const clear = (event) => {
    event?.stopPropagation();
    saveGoogleManualBalance(accountId, null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col items-stretch gap-1.5" onClick={event => event.stopPropagation()}>
        <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="w-12 shrink-0">Saldo</span>
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(false); }}
            placeholder="0,00"
            className="w-full min-w-0 bg-bg border border-primary/40 rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="w-12 shrink-0">Em</span>
          <input
            type="date"
            value={date}
            max={formatDateInput(new Date())}
            onChange={event => setDate(event.target.value)}
            className="w-full min-w-0 bg-bg border border-border rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-center justify-end gap-1">
          {manual && (
            <button type="button" onClick={clear} title="Remover saldo informado" className="p-0.5 rounded hover:bg-danger/20 text-danger">
              <Trash2 size={12} />
            </button>
          )}
          <button type="button" onClick={event => { event.stopPropagation(); setEditing(false); }} title="Cancelar" className="p-0.5 rounded hover:bg-danger/20 text-danger">
            <X size={12} />
          </button>
          <button type="button" onClick={save} disabled={!valid} title="Salvar" className="p-0.5 rounded hover:bg-success/20 text-success disabled:opacity-40">
            <Check size={12} />
          </button>
        </div>
        <p className="text-[10px] text-text-secondary/80 leading-snug">
          Digite o saldo que aparece no Google nesse dia. O gasto dos dias seguintes é descontado sozinho.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title={manual ? `Saldo de ${formatCurrency(manual.amount)} informado em ${formatDateBR(parseDateInput(manual.date))} — clique para atualizar` : 'Informar o saldo pré-pago desta conta'}
      className={`group inline-flex items-center gap-1 text-[11px] text-primary-light hover:underline ${compact ? '' : 'mt-0.5'}`}
    >
      <Pencil size={10} className="opacity-70" />
      {manual ? `Informado ${formatDateBR(parseDateInput(manual.date)).slice(0, 5)} · atualizar` : 'Informar saldo'}
    </button>
  );
}
