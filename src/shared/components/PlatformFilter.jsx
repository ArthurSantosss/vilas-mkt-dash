import { FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../constants/filterStyles';
// Mesmo estilo dos demais filtros do cabeçalho (Período, Agência, Conta),
// para entrar na mesma linha sem destoar.
export default function PlatformFilter({ value, onChange, disabled = false }) {
  return (
    <div className={FILTER_FIELD}>
      <label className={FILTER_LABEL}>Plataforma</label>
      <select
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className={FILTER_CONTROL}
      >
        <option value="meta">Meta Ads</option>
        <option value="google">Google Ads</option>
      </select>
    </div>
  );
}
