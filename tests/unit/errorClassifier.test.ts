import { describe, expect, it } from 'vitest';
import { classifyError } from '@/utilities/errorClassifier';

/**
 * ─── Clasificador de Errores y Resiliencia (Sprint 46) ──────────────────────
 *
 * Valida la detección precisa de fallos de infraestructura (Postgres caído o
 * desconectado, DNS pooler Supabase no resuelto, timeouts, Next.js server
 * component digest) para presentar mensajes dignos y orientados a la solución
 * en lugar de pantallas 500 genéricas sin contexto.
 */

describe('classifyError (Sprint 46)', () => {
  it('detecta errores de conexión TCP/Postgres (ECONNREFUSED)', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:54322');
    const result = classifyError(error);

    expect(result.category).toBe('database');
    expect(result.isDatabaseError).toBe(true);
    expect(result.title).toContain('Base de datos');
    expect(result.description).toMatch(/conexión|mantenimiento|iniciar/i);
    expect(result.canRetry).toBe(true);
  });

  it('detecta fallos de resolución DNS de Supabase (ENOTFOUND)', () => {
    const error = new Error('getaddrinfo ENOTFOUND aws-0-us-east-1.pooler.supabase.com');
    const result = classifyError(error);

    expect(result.category).toBe('database');
    expect(result.isDatabaseError).toBe(true);
    expect(result.description).toMatch(/servidor|conexión|supabase/i);
  });

  it('detecta terminación inesperada de conexión en Postgres', () => {
    const error = new Error('Connection terminated unexpectedly');
    const result = classifyError(error);

    expect(result.category).toBe('database');
    expect(result.isDatabaseError).toBe(true);
  });

  it('detecta errores de timeout de base de datos o pool', () => {
    const error = new Error('Connection timeout of 10000ms exceeded');
    const result = classifyError(error);

    expect(result.category).toBe('database');
    expect(result.isDatabaseError).toBe(true);
  });

  it('detecta errores de red o fetch', () => {
    const error = new Error('fetch failed');
    const result = classifyError(error);

    expect(result.category).toBe('network');
    expect(result.isDatabaseError).toBe(false);
    expect(result.canRetry).toBe(true);
  });

  it('detecta errores de autorización o acceso ERP', () => {
    const error = new Error('Acceso denegado: no perteneces a esta empresa');
    const result = classifyError(error);

    expect(result.category).toBe('auth');
    expect(result.isDatabaseError).toBe(false);
  });

  it('maneja errores sanitizados de Next.js en producción con digest', () => {
    const error = {
      name: 'Error',
      message: 'An error occurred in the Server Components render.',
      digest: '3750596518',
    };
    const result = classifyError(error);

    expect(result.digest).toBe('3750596518');
    expect(result.canRetry).toBe(true);
    expect(result.description).toBeDefined();
  });

  it('maneja valores no-Error (null, undefined, string) de forma segura', () => {
    expect(classifyError(null).category).toBe('unknown');
    expect(classifyError(undefined).category).toBe('unknown');
    expect(classifyError('fallo desconocido').category).toBe('unknown');
  });
});
