import { Link } from 'react-router-dom';
import { formatGoogleCustomerId } from '../../services/googleAdsApi';

export default function GoogleAdsIssues({ issues = [], error }) {
  if (!issues.length && !error) return null;
  return <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
    <p className="font-semibold">{issues.length ? `${issues.length} acesso(s) Google precisam de atenção. As outras contas continuam disponíveis.` : error}</p>
    {issues.length > 0 && <ul className="mt-2 space-y-3 text-xs">{issues.map((issue, index) => {
      const id = issue.accountId || issue.customerId;
      const generic = issue.message?.includes('The caller does not have permission');
      return <li key={`${id || ''}-${index}`}>
        <p className="font-medium">{issue.name || 'Conta/MCC'}{id ? ` · ${formatGoogleCustomerId(id)}` : ''}{issue.userEmail ? ` · ${issue.userEmail}` : ''}</p>
        <p>{generic ? 'O Google recusou o acesso a esta conta. Confira se o perfil ainda tem acesso em Google Ads → Administrador → Acesso e segurança; depois sincronize as contas.' : issue.message}</p>
        {issue.diagnostic?.codes?.length > 0 && <p className="mt-1 font-mono">Código: {issue.diagnostic.codes.join(', ')}</p>}
        {issue.diagnostic?.requestId && <p className="font-mono">Referência: {issue.diagnostic.requestId}</p>}
      </li>;
    })}</ul>}
    <Link to="/configuracoes" className="inline-block mt-2 underline">Abrir conexões em Configurações</Link>
  </div>;
}
