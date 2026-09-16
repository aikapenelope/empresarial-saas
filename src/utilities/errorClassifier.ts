/**
 * ─── Clasificador y Normalizador de Errores (Sprint 46) ─────────────────────
 *
 * Utilidad pura para inspeccionar excepciones del App Router de Next.js 15,
 * fallos de la Payload Local API y caídas de base de datos (Postgres / Supabase).
 *
 * En Next.js 15 en producción, los errores de Server Components se anonimizan
 * con un hash `digest`. Esta función detecta si el error contiene indicios de
 * caída de infraestructura o si viene anonimizado, estructurando una respuesta
 * amigable con acciones sugeridas para el usuario.
 */

export type ErrorCategory = 'database' | 'network' | 'auth' | 'not_found' | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  title: string;
  description: string;
  isDatabaseError: boolean;
  canRetry: boolean;
  digest?: string;
  technicalDetails?: string;
}

const DB_ERROR_PATTERNS = [
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /ETIMEDOUT/i,
  /connection terminated/i,
  /connection timeout/i,
  /closed the connection/i,
  /terminating connection/i,
  /client has encountered a connection error/i,
  /pooler\.supabase/i,
  /supabase/i,
  /postgres/i,
  /database/i,
  /drizzle/i,
];

const NETWORK_ERROR_PATTERNS = [
  /fetch failed/i,
  /network request failed/i,
  /failed to fetch/i,
  /network error/i,
  /dns/i,
];

const AUTH_ERROR_PATTERNS = [
  /acceso denegado/i,
  /unauthorized/i,
  /forbidden/i,
  /permiso insuficiente/i,
  /no perteneces a esta empresa/i,
  /no autenticado/i,
];

export function classifyError(error: unknown): ClassifiedError {
  let message = '';
  let digest: string | undefined;
  let name = '';

  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      message = (error as { message: string }).message;
    }
    if ('digest' in error && typeof (error as { digest: unknown }).digest === 'string') {
      digest = (error as { digest: string }).digest;
    }
    if ('name' in error && typeof (error as { name: unknown }).name === 'string') {
      name = (error as { name: string }).name;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  // 1. Errores de acceso y autorización
  if (name === 'ErpAccessError' || AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      category: 'auth',
      title: 'Acceso Restringido o Sesión Expirada',
      description:
        'No dispones de los permisos suficientes para acceder a esta empresa o tu sesión ha caducado. Comprueba tus credenciales o solicita acceso al administrador.',
      isDatabaseError: false,
      canRetry: false,
      digest,
      technicalDetails: message || undefined,
    };
  }

  // 2. Errores de conexión a base de datos (Postgres / Supabase / Pooler)
  if (DB_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      category: 'database',
      title: 'Base de datos temporalmente no disponible',
      description:
        'No se pudo establecer conexión con el servidor de la base de datos (Postgres/Supabase). Esto suele deberse a mantenimiento en curso, reinicio de servicios o reconexión de red.',
      isDatabaseError: true,
      canRetry: true,
      digest,
      technicalDetails: message || undefined,
    };
  }

  // 3. Errores de red o fetch
  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      category: 'network',
      title: 'Fallo de Conexión de Red',
      description:
        'Hubo un problema de comunicación de red al procesar la solicitud. Verifica tu conexión a internet e inténtalo de nuevo.',
      isDatabaseError: false,
      canRetry: true,
      digest,
      technicalDetails: message || undefined,
    };
  }

  // 4. Errores de Server Components en producción (con digest)
  if (digest) {
    return {
      category: 'unknown',
      title: 'Interrupción del Servicio del Sistema',
      description:
        'Ocurrió una interrupción al renderizar los componentes del servidor. Si el sistema se encuentra en mantenimiento o restaurando su base de datos, el servicio se restablecerá en unos momentos.',
      isDatabaseError: false,
      canRetry: true,
      digest,
      technicalDetails: message || `Digest ID: ${digest}`,
    };
  }

  // 5. Error desconocido / genérico
  return {
    category: 'unknown',
    title: 'Ocurrió un error inesperado',
    description:
      'El sistema encontró una situación inesperada al cargar la vista. Puedes reintentar la operación o volver al panel principal.',
    isDatabaseError: false,
    canRetry: true,
    digest,
    technicalDetails: message || undefined,
  };
}
