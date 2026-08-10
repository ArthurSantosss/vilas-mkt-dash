/* global process */

// api/report-summary.js
// Gera o sumário executivo do relatório em PDF a partir das métricas já
// apuradas pelo front. O modelo recebe SOMENTE números prontos e devolve texto
// estruturado via tool-use (garante JSON válido, sem parsing frágil).
//
// Se qualquer coisa falhar aqui, o front cai num resumo determinístico local —
// o relatório nunca deixa de ser gerado por causa da IA.

import { isAuthenticatedRequest } from './_auth.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `Você escreve o sumário executivo de um relatório de tráfego pago (Meta Ads) que será entregue em PDF ao CLIENTE FINAL de uma agência — o dono do negócio, não um especialista em mídia.

REGRAS INEGOCIÁVEIS:
- Use APENAS os números fornecidos. Nunca invente métrica, valor, comparação ou fato que não esteja no payload.
- Se um dado não existir no payload, simplesmente não fale dele.
- Escreva em português do Brasil, em terceira pessoa ou primeira do plural ("realizamos", "a conta"). Nunca use emojis.

TOM:
- Profissional, seguro e direto. Nada de jargão de mídia sem tradução (explique CTR, CPM, frequência em linguagem de negócio quando citar).
- Honesto: se um indicador piorou, diga com naturalidade e mostre a leitura técnica, sem drama e sem esconder. Evite tanto o otimismo vazio quanto o alarmismo.
- Sem promessas de resultado futuro.

CONHECIMENTO DE DOMÍNIO:
- "Conversas iniciadas" são pessoas que abriram conversa por mensagem — é o resultado principal quando o objetivo é Mensagens.
- Custo por resultado: quanto MENOR, melhor. Queda no custo é melhora.
- Frequência alta (acima de ~3) com queda de CTR costuma indicar desgaste de criativo.
- CPM é o custo para alcançar mil impressões; varia com concorrência e sazonalidade.`;

const SUMMARY_TOOL = {
  name: 'entregar_sumario',
  description: 'Entrega o sumário executivo estruturado do relatório.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'Uma frase de no máximo 130 caracteres que resume o período. Sem ponto final se for muito curta.',
      },
      paragraphs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Entre 2 e 3 parágrafos de 2 a 4 frases cada, lendo o desempenho do período e comparando com o anterior quando houver dado.',
      },
      highlights: {
        type: 'array',
        items: { type: 'string' },
        description: 'De 3 a 4 destaques objetivos, uma linha cada, sempre ancorados num número do payload.',
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'De 3 a 4 próximos passos concretos para o período seguinte, uma linha cada.',
      },
    },
    required: ['headline', 'paragraphs', 'highlights', 'recommendations'],
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no ambiente do servidor.' });
  }

  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Campo "payload" é obrigatório.' });
  }

  const userPrompt = [
    'Escreva o sumário executivo do relatório com base nestes dados apurados:',
    '',
    JSON.stringify(payload, null, 2),
    '',
    'Chame a ferramenta entregar_sumario com o resultado.',
  ].join('\n');

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1600,
        system: SYSTEM_PROMPT,
        tools: [SUMMARY_TOOL],
        tool_choice: { type: 'tool', name: 'entregar_sumario' },
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[report-summary] Anthropic error:', response.status, errorText);
      return res.status(502).json({ error: `Anthropic API ${response.status}` });
    }

    const reply = await response.json();
    const toolUse = (reply.content || []).find((block) => block.type === 'tool_use');

    if (!toolUse?.input) {
      return res.status(502).json({ error: 'Resposta da IA sem sumário estruturado.' });
    }

    return res.status(200).json({ summary: toolUse.input, source: 'ai' });
  } catch (error) {
    console.error('[report-summary] error:', error);
    return res.status(502).json({ error: `Falha ao gerar sumário: ${error?.message || 'erro desconhecido'}` });
  }
}
