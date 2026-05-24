/* global process */

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const AUTH_COOKIE_NAME = 'vilasmkt_auth_server';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [rawKey, ...rawValue] = part.split('=');
      if (!rawKey) return acc;
      acc[rawKey] = decodeURIComponent(rawValue.join('=') || '');
      return acc;
    }, {});
}

function getConfiguredCredentials() {
  const authorizedEmail = (process.env.AUTH_EMAIL || process.env.VITE_AUTH_EMAIL || '').trim().toLowerCase();
  const authorizedPass = process.env.AUTH_PASS || process.env.VITE_AUTH_PASS || '';
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
  const cookies = parseCookies(req?.headers?.cookie || '');
  const expectedToken = createSessionToken();
  const cookieToken = cookies[AUTH_COOKIE_NAME] || '';

  if (!expectedToken || !cookieToken) return false;
  return safeCompare(cookieToken, expectedToken);
}

export function setAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookieParts(createSessionToken(), AUTH_COOKIE_MAX_AGE).join('; '));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookieParts('', 0).join('; '));
}
