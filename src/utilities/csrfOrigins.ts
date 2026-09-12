/**
 * Orígenes de confianza para CSRF (Sprint R7 · S0-2).
 *
 * Payload NO aplica allowlist cuando `csrf` está vacío (`auth/extractJWT`), así que
 * un default vacío dejaba la autenticación por cookie aceptada desde CUALQUIER
 * origen. Se deriva un allowlist SEGURO por defecto:
 *
 *   1. `PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL` — dominios de la aplicación.
 *   2. `https://$VERCEL_URL` — el origen de ESTE despliegue. Vercel inyecta
 *      `VERCEL_URL` en **cada** deployment (incluidos los previews), así que cada
 *      entorno se autoriza a sí mismo y los previews NO se rompen (ese era el
 *      motivo por el que antes el allowlist era opt-in y quedaba vacío).
 *   3. `PAYLOAD_CSRF_ORIGINS` — orígenes EXTRA, coma-separados.
 *
 * Cada valor se CANONICALIZA a su origen (`new URL(value).origin`): descarta
 * path, query, slash final y espacios. Sin esto, un valor como
 * `https://app.example.com/erp` (o con espacios) nunca coincidiría con el header
 * `Origin` del navegador y rompería la autenticación (reporte Devin #92). Los
 * valores sin esquema (p. ej. `app.example.com`) son inválidos y se descartan.
 * El resultado se deduplica.
 */
export function computeCsrfOrigins(env: Partial<NodeJS.ProcessEnv> = process.env): string[] {
  const raw: Array<string | undefined> = [
    env.PUBLIC_BASE_URL,
    env.NEXT_PUBLIC_SITE_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
    ...(env.PAYLOAD_CSRF_ORIGINS || '').split(','),
  ];

  const origins = raw
    .map((value) => {
      const candidate = (value ?? '').trim();
      if (!candidate) return null;
      try {
        return new URL(candidate).origin;
      } catch {
        // Valor sin esquema o malformado: no es un origen válido, se descarta.
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);

  return [...new Set(origins)];
}
