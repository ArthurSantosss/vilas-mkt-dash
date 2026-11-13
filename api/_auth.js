/* global process */

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const AUTH_COOKIE_NAME = 'vilasmkt_auth_server';
// Renovado a cada chamada autenticada (renewAuthCookie): só expira após 30 dias sem uso.
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [rawKey, ...rawValue] = part.split('=');
      if (!rawKey) return acc;
      acc[rawKey] = rawValue.join('=') || '';
      return acc;
    }, {});
}

function getConfiguredCredentials() {
  const authorizedEmail = (process.env.AUTH_EMAIL || process.env.VITE_AUTH_EMAIL || '').trim().toLowerCase();
  const authorizedPass = process.env.AUTH_PASS || '';
  const sessionSecret = process.env.AUTH_SESSION_SECRET || authorizedPass;

  return { authorizedEmail, authorizedPass, sessionSecret };
}

function createSessionToken() {
  const { authorizedEmail, authorizedPass, sessionSecret } = getConfiguredCredentials();
  if (!authorizedEmail || !authorizedPass || !sessionSecret) return '';

  return crypto
    .createHash('sha256')
    .update(`${authorizedEmail}|${authorizedPass}|${sessionSecret}`)
    .digest('hex');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildCookieParts(value, maxAge) {
  return [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : null,
  ].filter(Boolean);
}

export function getAuthCookieName() {
  return AUTH_COOKIE_NAME;
}

export function getConfiguredAuth() {
  return getConfiguredCredentials();
}

export function isAuthenticatedRequest(req) {
  // 1. Verificação por Cookie HTTP-only
  const cookies = parseCookies(req?.headers?.cookie || '');
  const expectedToken = createSessionToken();
  const cookieToken = cookies[AUTH_COOKIE_NAME] || '';

  if (expectedToken && cookieToken && safeCompare(cookieToken, expectedToken)) {
    return true;
  }

  return false;
}

/** Acrescenta um Set-Cookie sem apagar os que a resposta já tem. */
function appendSetCookie(res, cookie) {
  const current = res.getHeader?.('Set-Cookie');
  const list = current ? (Array.isArray(current) ? current : [String(current)]) : [];
  res.setHeader('Set-Cookie', [...list.filter(item => !item.startsWith(`${AUTH_COOKIE_NAME}=`)), cookie]);
}

/**
 * Sessão deslizante: se a requisição está autenticada, estende o cookie por mais 30 dias.
 * Retorna se a requisição está autenticada (substitui isAuthenticatedRequest nos handlers).
 */
export function renewAuthCookie(req, res) {
  if (!isAuthenticatedRequest(req)) return false;
  appendSetCookie(res, buildCookieParts(createSessionToken(), AUTH_COOKIE_MAX_AGE).join('; '));
  return true;
}

export function setAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookieParts(createSessionToken(), AUTH_COOKIE_MAX_AGE).join('; '));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookieParts('', 0).join('; '));
}
