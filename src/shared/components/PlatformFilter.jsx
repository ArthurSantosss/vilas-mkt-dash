// Mesmo estilo dos demais filtros do cabeçalho (Período, Agência, Conta),
// para entrar na mesma linha sem destoar.
export default function PlatformFilter({ value, onChange, disabled = false, className = 'sm:w-[180px]' }) {
  return (
    <div className={`flex flex-col gap-1.5 col-span-1 ${className}`}>
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Plataforma</label>
      <select
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="meta">Meta Ads</option>
        <option value="google">Google Ads</option>
      </select>
    </div>
  );
}
