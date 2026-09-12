/**
 * Orígenes de confianza para CSRF (Sprint R7 · S0-2).
 *
 * Payload NO aplica allowlist cuando `csrf` está vacío (`auth/extractJWT`), así que
 * un default vacío dejaba la autenticación por cookie aceptada desde CUALQUIER
 * origen (reporte Devin #92). Se deriva un allowlist SEGURO por defecto:
 *
 *   1. `PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL` — dominios de la aplicación.
 *   2. `https://$VERCEL_URL` — el origen de ESTE despliegue. Vercel inyecta
 *      `VERCEL_URL` en **cada** deployment (incluidos los previews), así que cada
 *      entorno se autoriza a sí mismo y los previews NO se rompen (ese era el
 *      motivo por el que antes el allowlist era opt-in y quedaba vacío).
 *   3. `PAYLOAD_CSRF_ORIGINS` — orígenes EXTRA, coma-separados.
 *
 * Se normalizan (sin slash final) y se deduplican.
 */
export function computeCsrfOrigins(env: Partial<NodeJS.ProcessEnv> = process.env): string[] {
  const raw: Array<string | undefined> = [
    env.PUBLIC_BASE_URL,
    env.NEXT_PUBLIC_SITE_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
    ...(env.PAYLOAD_CSRF_ORIGINS || '').split(','),
  ];

  const origins = raw
    .map((origin) => (origin ?? '').trim().replace(/\/+$/, ''))
    .filter((origin): origin is string => origin.length > 0);

  return [...new Set(origins)];
}
