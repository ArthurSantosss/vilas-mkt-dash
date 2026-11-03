import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstagramReportText } from '../src/shared/utils/instagramReportText.js';

const base = {
  profile: { name: 'Clínica Sorriso', username: 'clinicasorriso', followers: 12500 },
  previousRange: { start: '2026-10-20', end: '2026-10-26' },
  metrics: {
    reach: { current: 20000, previous: 16000 },
    views: { current: 55000, previous: 50000 },
    interactions: { current: 900, previous: 800 },
    likes: { current: 700, previous: 600 },
    comments: { current: 80, previous: null },
    saves: { current: null, previous: null, note: 'bloqueado' },
  },
  followers: {
    follows: { current: 150, previous: 100 },
    unfollows: { current: 30, previous: 40 },
    net: { current: 120, previous: 60 },
  },
  posts: [
    { productType: 'REELS', mediaType: 'VIDEO', caption: 'Reel campeão', reach: 9000, likes: 400, comments: 30, saves: 20, shares: 10 },
    { mediaType: 'CAROUSEL_ALBUM', caption: 'Carrossel', reach: 3000, likes: 50, comments: 5, saves: 5, shares: 0 },
  ],
};

test('relatório do Instagram traz cabeçalho, período, perfil e assinatura', () => {
  const text = buildInstagramReportText(base, { start: '2026-10-27', end: '2026-11-02', agencyName: 'Vilas Mkt' });
  assert.match(text, /Relatório de Desempenho — Instagram/);
  assert.match(text, /Período Analisado: 27\/10 a 02\/11/);
  assert.match(text, /Comparativo: 20\/10 a 26\/10/);
  assert.match(text, /Perfil: Clínica Sorriso \(@clinicasorriso\)/);
  assert.match(text, /#VILASMKT 🚀$/);
});

test('métricas com variação e omissão das que a API não liberou', () => {
  const text = buildInstagramReportText(base, { start: '2026-10-27', end: '2026-11-02' });
  assert.match(text, /Contas alcançadas: 20\.000 \(\+25,0%\)/);
  assert.match(text, /Saldo de seguidores: \+120/);
  assert.match(text, /Taxa de engajamento: 4,50%/);
  assert.match(text, /Comentários: 80\n/); // sem base anterior → sem variação
  assert.doesNotMatch(text, /Salvamentos/);
  assert.match(text, /Publicações no período: 2/);
  assert.match(text, /Reels foi o formato mais engajador/);
  assert.match(text, /Destaque do período: reels "Reel campeão"/);
});

test('sem posts sugere retomar publicações e não quebra com dados vazios', () => {
  const text = buildInstagramReportText({ metrics: {}, followers: {}, posts: [] }, { start: '2026-10-01', end: '2026-10-31', accountName: 'Conta X' });
  assert.match(text, /Perfil: Conta X/);
  assert.match(text, /Publicações no período: 0/);
  assert.match(text, /Retomar a frequência de publicações/);
});
