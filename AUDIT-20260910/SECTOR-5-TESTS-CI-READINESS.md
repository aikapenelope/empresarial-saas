# SECTOR 5 — TESTS, CI/CD Y READINESS PARA PRODUCCIÓN
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Modo: lectura

---

## RESUMEN EJECUTIVO DEL SECTOR

La suite existente es **de alta calidad pero mínima**: 27 tests (3 unitarias + 1 integración) que prueban exactamente los puntos de mayor riesgo histórico (kardex multi-producto — regresión Devin #55, calendario Venezuela UTC-4 — Devin #54, neutralización CSV, tax). El CI es serio (Postgres real + migraciones + typecheck + lint + tests, sin mocks de BD) pero **sin `pnpm audit` gate ni build**. La cobertura de dominios críticos está en cero: pagos, compras, cajas, POS, numeración, multi-tenant, compartición, pricing. Readiness producción: **65%** — los P0/P1 de Sectores 0-2 son los blockers.

**Score Tests: 5/10 · Readiness: 6.5/10**

---

## 1. MATRIZ DE COBERTURA DE TESTS (dominio × suite)

| Dominio | Suite | Tests | Qué cubre | Estado |
|---|---|---|---|---|
| Kardex venta/anulación/compra | `tests/integration/salesInventory.test.ts` | 6 | multi-producto, stock insuficiente, factura de servicio, inmutabilidad, recepción multi-línea | ✓ (regresión Devin #55) |
| Calendario negocio UTC-4 | `tests/unit/erpValidation.test.ts` | 11 | bordes de rango, medianoche Caracas, issueDate vs createdAt | ✓ (regresión Devin #54) |
| CSV export | `tests/unit/csv.test.ts` | 3 | escape de fórmulas/quotes/controles | ✓ |
| Tax/IGTF | `tests/unit/tax.test.ts` | 7 | cómputo de impuestos | ✓ |
| **POS / createInvoice end-to-end** | — | 0 | flujo completo, doble submit, cortesía | ✗ |
| **Pagos CxC (createPaymentAction)** | — | 0 | allocations, IGTF, sobrepago | ✗ |
| **Compras / pagos CxP** | — | 0 | receivePurchaseGoods, allocations supplier | ✗ |
| **Cajas / cierre de turno** | — | 0 | arqueo, descuadres, carrera cierre/pago | ✗ |
| **Numeración (nextDocumentNumber)** | — | 0 | concurrencia, formato, unique constraints | ✗ (9 callers, 0 tests) |
| **Multi-tenant aislamiento** | — | 0 | cross-tenant access | ✗ |
| **Compartición / emails** | — | 0 | tokens, estados finales | ✗ |
| **Pricing tiers** | — | 0 | resolveEffectiveRate, historial | ✗ |
| **Alertas / jobs** | — | 0 | evaluador | ✗ |
| **Production orders** | — | 0 | consumo BOM, locks | ✗ |

**Ratio: 27 tests / ~48k LOC.** Los tests existentes prueban COMPORTAMIENTO (no implementación) — buen estilo — pero el 90% de la superficie de negocio no tiene red.

## 2. PIPELINE CI — ACTUAL vs REQUERIDO

**Actual (ci.yml):** pnpm install → typecheck → lint → **migrate contra Postgres 17 real** → vitest (unit + integración). Concurrency cancel-in-progress ✓. Trigger en PR + push main ✓.

| Gap | Riesgo | Fix | Esfuerzo |
|---|---|---|---|
| **Sin `pnpm audit` gate** | Las 11 vulns (2 critical Next) pasaron al main silenciosamente | Step `pnpm audit --audit-level high` (o la skill audit-dependencies con script) | S |
| **Sin `next build`/`payload build`** | Errores de build solo aparecen en Vercel (cuota diaria limitada — AGENTS.md §5.2) | Step de build en CI (o nightly para no gastar runners) | S |
| Sin migración `down` test | reversibilidad no verificada | opcional: `pnpm migrate:fresh` en job desechable | S |
| Sin preview deploy check | — | Vercel lo hace ya | n/a |

## 3. PROTOCOLO BD LOCAL

`scripts/db-local.sh` (puerto 54322, `/tmp/pg-local`) — verificado: 3 referencias al puerto correcto, protocolo §5.1 respetado (stop antes de rm — hallazgo Devin #47 ya fixeado en el historial). `vitest.config.ts` documenta el prerequisito (cluster 54322 o container CI) ✓. Robusto.

## 4. CHECKLIST DE PRODUCCIÓN

| Ítem | Estado | Evidencia |
|---|---|---|
| Migraciones aplicadas en Supabase (`migrate:status`) | ⚠ VERIFICAR en deploy | 22 migraciones; `prodMigrations: migrations` en config (correcto) |
| Secretos en Vercel | ⚠ VERIFICAR | DATABASE_URI/DIRECT_URL, PAYLOAD_SECRET (throw si falta ✓ config:50-55), S3, RESEND_API_KEY |
| `PUBLIC_BASE_URL` en prod | ⚠ documentar | shareActions lo exige (`shareActions.ts:69`); **NO está en .env.example** — gap de docs |
| `RESEND_API_KEY` | ⚠ documentar | usado en config:163; **NO está en .env.example** — gap |
| Email prod (Resend) | listo cuando se setee | adapter condicional correcto |
| S3 storage | `enabled: Boolean(S3_BUCKET)` — degrada sin bucket ✓ | config:261 |
| Backups Supabase | fuera del repo | — VERIFICAR plan (PITR de Supabase) |
| Monitoreo/errores (Sentry) | ✗ SIN | cero integración — P2-S5 |
| Rate limiting | ✗ solo implícito | ver P2-S1-01 (exchange-rates) |
| HTTPS/HSTS | ✓ Vercel | headers propios ausentes (P2-S1-05) |
| Términos Transaction Pooler | ✓ | pool 10 + 6543 correcto (AGENTS.md §3) |
| GDPR/privacy | n/a (B2B VE) | — |

## 5. ROADMAP — GAPS ABIERTOS

- "Pendiente Fase 10" (ROADMAP:319): paginación server-side en **compras/pagos** (facturas/cotizaciones/pedidos ya hechos — Sprint 39/40). Riesgo de lanzamiento MEDIO (listados completos = Sector 4 P1-S4-01).
- Kardex page con filtros/paginación (ROADMAP:285) — pendiente.
- Fase 12 (modales) cerrada ✓. Fase 13 investigación ✓ docs.

## 6. HALLAZGOS DEL SECTOR

| ID | Severidad | Hallazgo | Evidencia | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| **P1-S5-01** | **P1** | Cobertura cero en los flujos de dinero críticos: pagos, compras, cajas, POS, numeración | matriz §1 | cada fix en esos dominios es un salto al vacío sin red de regresión | **M-L** — suite de integración por dominio (pagos primero) |
| P2-S5-01 | P2 | CI sin `pnpm audit` gate — 11 vulns (2 critical) entraron al main sin blockers | ci.yml | RCE known shipping a producción | S |
| P2-S5-02 | P2 | CI sin build — errores de compilación se descubren en Vercel (cuota diaria) | ci.yml pasos | desperdicio de cuota Vercel (§5.2) | S |
| P2-S5-03 | P2 | `.env.example` sin `PUBLIC_BASE_URL` ni `RESEND_API_KEY` (vars exigidas por features activas: share/email) | .env.example | deploy prod rompe share/email silenciosamente | S |
| P2-S5-04 | P2 | Sin monitoreo de errores (Sentry u otro) | grep sentry = 0 | errores de prod invisibles | S |
| P3-S5-01 | P3 | Test de concurrencia de numeración/caja inexistente (los edge cases del Sector 2 no tienen test) | — | las carreras descritas no se reproducen en CI | M |

## 7. VEREDICTO READINESS: **65%**

- **Blockers antes de producción (orden):** P1-S1-01 (bump Next RCE), P1-S1-02/P1-S0-01 (unlock CVE + maxAttempts), P1-S2-01 (unique constraints), P1-S2-02 (caja tx), P1-S4-01 (dashboard SQL — según volumen esperado), P2-S5-01/02 (CI gates).
- **Puede esperar post-launch:** P1-S2-03 (costo ponderado — si hay pocas anulaciones), paginación compras/pagos, P2-S5-04 (Sentry — aunque muy recomendado desde el día 1), todo P3.
- **Estimación a producción segura:** 2 sprints de reparación (ver REPORT.md §plan).
