import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../constants/filterStyles';

export default function ReportFormatSelector() {
  const id = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const format = searchParams.get('formato') === 'visual' ? 'visual' : 'texto';

  return (
    <div className={FILTER_FIELD}>
      <label htmlFor={id} className={FILTER_LABEL}>Formato</label>
      <select
        id={id}
        value={format}
        onChange={event => {
          const next = new URLSearchParams(searchParams);
          next.set('formato', event.target.value);
          setSearchParams(next);
        }}
        className={FILTER_CONTROL}
      >
        <option value="texto">Texto</option>
        <option value="visual">Visual</option>
      </select>
    </div>
  );
}
