export function googleAdsError(payload, response) {
  const details = payload.error?.details || [];
  const codes = [...new Set(details.flatMap(detail => (detail.errors || [])
    .flatMap(error => Object.values(error.errorCode || {}))))];
  const reason = details.find(detail => detail.reason)?.reason;
  if (reason) codes.push(reason);
  const rawMessage = payload.error?.message || `Google Ads API ${response.status}`;
  let guidance = 'Sincronize as contas. Se persistir, confira o acesso do perfil à conta e envie o código do erro para análise.';
  if (codes.includes('USER_PERMISSION_DENIED')) guidance = 'Em Google Ads → Administrador → Acesso e segurança, confira se este e-mail acessa a conta ou a MCC indicada. Depois sincronize as contas na plataforma.';
  else if (codes.some(code => ['CUSTOMER_NOT_ENABLED', 'CUSTOMER_NOT_FOUND'].includes(code))) guidance = 'Confira no Google Ads se a conta foi ativada e está disponível para este perfil.';
  else if (codes.some(code => ['CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION', 'DEVELOPER_TOKEN_NOT_APPROVED', 'DEVELOPER_TOKEN_PROHIBITED'].includes(code))) guidance = 'Confira a aprovação para contas reais no projeto Google Cloud que possui o cliente OAuth desta plataforma.';
  else if (codes.some(code => ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'INSUFFICIENT_SCOPE'].includes(code))) guidance = 'Adicione novamente este perfil Google e autorize a permissão do Google Ads na tela de consentimento.';
  else if (codes.includes('SERVICE_DISABLED')) guidance = 'Habilite a Google Ads API no projeto Google Cloud do cliente OAuth usado pela plataforma.';
  const denied = response.status === 403 || payload.error?.status === 'PERMISSION_DENIED';
  const message = denied ? 'O Google recusou o acesso.' : rawMessage;
  const error = new Error(`${message} ${guidance}`);
  error.status = response.status;
  error.diagnostic = { codes, rawMessage, guidance, requestId: response.headers?.get?.('request-id') || details.find(d => d.requestId)?.requestId || null };
  return error;
}

export function describeGoogleAdsError(error) {
  return { message: error.message, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) };
}

export function canRetryGoogleAdsAccess(error) {
  return error.status === 403 || error.diagnostic?.codes?.includes('USER_PERMISSION_DENIED');
}
