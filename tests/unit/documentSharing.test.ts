import { describe, expect, it } from 'vitest';
import {
  isShareTokenExpired,
  shareTokenExpiry,
  SHARE_TOKEN_TTL_DAYS,
} from '@/utilities/documentSharing';

/**
 * ─── Caducidad del enlace público (Sprint R4 · S1-1) ────────────────────────
 *
 * El token de compartición es una CAPACIDAD con ventana de validez. Estos tests
 * fijan el contrato: se acuña a TTL días; un valor pasado caduca; `null`
 * (token legado sin caducidad) sigue vigente.
 */

describe('documentSharing — caducidad del enlace (S1-1)', () => {
  it('acuña la caducidad a TTL días desde la emisión', () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const expiry = shareTokenExpiry(from);
    const expected = new Date(from.getTime() + SHARE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    expect(expiry).toBe(expected);
  });

  it('detecta vencido y vigente', () => {
    expect(isShareTokenExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isShareTokenExpired(new Date(Date.now() + 3_600_000).toISOString())).toBe(false);
  });

  it('un token legado sin caducidad sigue vigente (null/undefined)', () => {
    expect(isShareTokenExpired(null)).toBe(false);
    expect(isShareTokenExpired(undefined)).toBe(false);
  });
});
