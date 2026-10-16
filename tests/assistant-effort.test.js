import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEffort } from '../api/assistant-chat.js';

const ask = (content) => [{ role: 'user', content }];

test('consulta pontual usa esforço médio', () => {
    assert.equal(pickEffort(ask('Quanto a conta da Clínica X gastou ontem?'), ''), 'medium');
});

test('pedido de análise usa esforço alto', () => {
    assert.equal(pickEffort(ask('Qual o gargalo da conta da Clínica X?'), ''), 'high');
    assert.equal(pickEffort(ask('Por que o CPL subiu essa semana?'), ''), 'high');
});

test('considera o último pedido do usuário', () => {
    const messages = [...ask('Faça um diagnóstico da conta'), { role: 'assistant', content: 'ok' }, ...ask('E quanto gastou hoje?')];
    assert.equal(pickEffort(messages, ''), 'medium');
});

test('ANTHROPIC_EFFORT fixa o esforço', () => {
    assert.equal(pickEffort(ask('Qual o gargalo?'), 'low'), 'low');
});
