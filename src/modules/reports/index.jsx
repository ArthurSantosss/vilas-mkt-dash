import { lazy, Suspense } from 'react';
import { ReportSessionContext, useReportWorkspace } from './useReportSession';
import { useSearchParams } from 'react-router-dom';

const ReportText = lazy(() => import('../report-text'));
const ReportVisual = lazy(() => import('../report-visual'));

export default function Reports() {
  const session = useReportWorkspace();
  const [searchParams] = useSearchParams();
  const isVisual = searchParams.get('formato') === 'visual';

  return (
    <ReportSessionContext.Provider value={session}>
      <Suspense fallback={<p role="status" className="py-8 text-center text-text-secondary">Carregando relatório...</p>}>
        {isVisual ? <ReportVisual /> : <ReportText />}
      </Suspense>
    </ReportSessionContext.Provider>
  );
}
