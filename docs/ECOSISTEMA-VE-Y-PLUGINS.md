# Ecosistema Fiscal Venezolano Open-Source y Roadmap de Plugins

> Investigación (septiembre 2026) para construir los próximos módulos de Empresarial
> adaptando a Payload lo que el ecosistema venezolano ya validó. Complementa a
> [`FASE-13-INVESTIGACION.md`](./FASE-13-INVESTIGACION.md) (infraestructura) y
> [`IMPLEMENTACIONES-ESTRUCTURALES.md`](./IMPLEMENTACIONES-ESTRUCTURALES.md) (7 PRs
> aprobados). Solo documentación — cero código de producción.

---

## 1. Los repos del ecosistema — qué hay y qué está vivo

### 1.1 ADempiere (la casa venezolana: ERPCYA/Solop, Yamel Senih)

| Repo | Estado | Qué aporta a nuestro plugin |
|---|---|---|
| [`adempiere/LVE`](https://github.com/adempiere/LVE) | Activo (Java) | **El modelo de oro**: listas de tasas versionadas (`LVE_List/Version/Line` con `ValidFrom`), retención IVA 75/100 (Gaceta 40.720, SNAT/2015/0049), ISLR con tipos de persona PNR/PNNR/PJD/PJND/PJNCD + sustraendo (factor 83.3334) + tramos en UT, municipal por actividad económica, número de control con secuencia propia + alerta de rango agotado, Libro de Compras/Ventas (`LVE_RV_InvoiceBook`, Arts. 70-73 Reglamento IVA), exportadores TXT IVA / XML ISLR / municipales (Araure, Páez), IGTF bancario (FBTT), nómina VE (BANAVIH TXT, INCES, ARC/ARCV, cesta ticket), extractos y pagos en lote de 10 bancos VE. |
| [`adempiere/withholding-engine`](https://github.com/adempiere/withholding-engine) | Activo | Motor de retenciones: `WH_Type/Definition/Setting/Withholding`, contrato `AbstractWithholdingSetting` (elegibilidad `isValid()` separada del cálculo `run()`), comprobante inmutable con workflow y declaración agrupadora. **Copiamos el modelo, no la maquinaria ADempiere** (diccionario de datos, reflexión por class name, validators en transacción: descartados). |
| `erpcya/adempiere-pos-improvements` | Activo | POS: verificación de pagos bajo supervisión (pago móvil/Zelle → notificación al supervisor — coincide con nuestro PR de aprobaciones), topes de descuento por línea/documento, reembolsos con límites diarios, exoneración de IVA por tipo de documento, depósitos/retiros caja→banco, vendedor por terminal, PIN/permisos. |
| `solop-develop/docs` + `erpcya/docs` | Activo | Los flujos que los clientes reales usan a diario: retenciones, declaraciones, nómina, conciliación bancaria, X/Z fiscal. |

### 1.2 Odoo — cuatro familias, de la vieja a la más moderna

| Repo | Versión Odoo | Actividad | Qué valida |
|---|---|---|---|
| [`odoo-mastercore/odoo-venezuela`](https://github.com/odoo-mastercore/odoo-venezuela) (SINAPSYS/MASTERCORE) | 15 | Activo | Base sólida: RIF J/G/V/E/C/P + responsabilidades SENIAT (ordinario/formal/especial), tabla ISLR 001-086, retención IVA 75/100 con distribución por alícuota, comprobantes de retención (IVA e ISLR) con numeración AAAAMM+8, Libro IVA XLSX con alícuotas 16/8/31 y wizard de declaración, DPT completa (estados/municipios/parroquias), tasa BCV. **IGTF no nativo** (solo columnas). |
| [`binaural-dev/odoo-venezuela`](https://github.com/binaural-dev/odoo-venezuela) | 17/18 | Activo (pushes diarios) | Suite amplia: `fiscal_lock_days` (bloqueo de días fiscales), `exchange_difference` (diferencia cambiaria), `dispatch_guide_digital` (guía de despacho), `currency_rate_live` + `rate`, `ref_bank`, `tax_payer`, `stock_barcode`, `auditlog`, cierre fiscal de año, igtf. |
| [`OCA/l10n-venezuela`](https://github.com/OCA/l10n-venezuela) | 18 | **Reactivado 2026** | Arranca con `currency_rate_update_bcv` (actualización automática de tasa BCV). El aval de calidad de la OCA volviendo a Venezuela. |
| [`bwealthics/l10n-venezuela-bw`](https://github.com/bwealthics/l10n-venezuela-bw) | **19** | Activo | **La referencia moderna — provisorias 2024-2025 incorporadas**: `wh_iva` con **PA SNAT/2025/000054** (nueva base legal de retención IVA, comprobante AAAAMM+8, TXT forma 99035), `igtf` **en ambas direcciones** (gasto propio al pagar en divisas + percepción 3% como Sujeto Pasivo Especial), `fiscal_books` (Libros XLSX con N° de control, **canal de emisión por diario** y modo contingencia, Arts. 70-78 + PA 0071), `invoice_format` (fecha/hora legal, marca "(E)", datos de imprenta, equivalencia en Bs con nota de tasa — PA 0071 + **PA SNAT/2024/000102**), `einvoice` (conector de imprenta digital autorizada, núcleo + proveedor simulado — PA 000102/000121), `fiscal_printer` (máquina fiscal HKA vía bridge local, reporte Z), `municipal` (patente con mínimo tributable en veces MMV), `payroll` (IVSS, RPE, FAOV, INCES, ISLR AR-I, CEPP, cesta ticket, recibo bimonetario), `chart` (VEN-NIF 6 dígitos, SPE, tipo contribuyente). |

### 1.3 Independientes y datos

| Repo | Aporte |
|---|---|
| [`carlosortg/l10n_ve_seniat`](https://github.com/carlosortg/l10n_ve_seniat) (Odoo 19) | Paquete completo de cumplimiento (base→account→withholding iva/islr→invoice→igtf→fiscal_book→reports→bank→currency_bcv) + `MATRIZ_PROVIDENCIA_121.md` (matriz de cumplimiento, hoy derogada — útil como checklist histórico) y deploy Docker/Coolify. |
| [`l10n-venezuela/factura_digital_seniat`](https://github.com/l10n-venezuela/factura_digital_seniat) | Facturación electrónica según normativa SENIAT (tenue, solo README activo — vigilar). |
| `vijoin/l10n_ve_dpt`, `BachacoVE/l10n_ve_dpt` | División político-territorial (estados/municipios/parroquias con códigos) — el CSV de Odoo-15 ya lo cubre; estos son respaldo. |
| `AppSoftwares/BiMoneta` (TypeScript, activo) | Facturación digital USD/Bs con tasa BCV — señal de que el stack TS moderno ya vende en VE. |
| `panchove/ARGO-FISCAL-PRINTER-360` | Plataforma de integración de impresoras fiscales (el espacio hardware fiscal sigue vivo). |

**Marco regulatorio vigente (verificado sep-2026)**: PA **SNAT/2024/000102** (facturación por medios digitales, G.O. 43.032 del 19-dic-2024, obligatoria 19-mar-2025) y **SNAT/2025/000054** (retención IVA) siguen vigentes; PA **SNAT/2026/00084** (G.O. 43.435, 12-ago-2026) **derogó la homologación obligatoria** de software (121) — libertad tecnológica, pero estructura fiscal (número de control, correlativos, libros) sigue auditable según PA 0071/000102. Máquinas fiscales nuevas paralizadas desde 22-jul-2026; RIF ya no vence. Ninguno de los repos viejos (LVE/Odoo-15) refleja 2024-2026; **bwealthics y carlosortg sí**.

---

## 2. El plugin fiscal de Empresarial — checklist validado por el ecosistema

Cuando lo construyamos (planeado para luego; sprint previo de investigación de formatos
+ sesión con contador), esta es la lista de features que el ecosistema ya validó y que
adaptaremos a Payload, en orden:

**v1 — Retenciones IVA + base fiscal** (normas: PA SNAT/2025/000054, PA 0071)
- [ ] Datos fiscales de socio: RIF con validación de formato (J/G/V/E/C/P), tipo de persona (PNR/PNNR/PJD/PJND/PJNCD), responsabilidad SENIAT (ordinario/formal/especial), flags contribuyente/exento de retención.
- [ ] Listas de tasas versionadas (patrón LVE): tipo → lista → versión `ValidFrom` → tramos; **UT como lista versionada**; precarga 75/100 y alícuotas 16/8/31 (+general aumentada como data).
- [ ] Retención de IVA a proveedores al completar compra (elegibilidad separada del cálculo, patrón `AbstractWithholdingSetting` adaptado a utilities).
- [ ] Comprobante de retención inmutable con numeración AAAAMM+8, agrupación por proveedor/período.
- [ ] Número de control en facturas con secuencia propia, gestión de rangos y alerta de agotamiento (patrón LVE `DocumentTypeSequence`).
- [ ] Libro de Compras y Libro de Ventas formato fiscal (base/exento por alícuota, N° control, canal de emisión, notas tipo 01/02/03 con documento afectado) — upgrade de nuestros reportes CSV existentes.
- [ ] Resumen de declaración IVA (débitos, créditos, autoliquidación — wizard de Odoo-15).
- [ ] Export TXT forma 99035 (retenciones IVA) — plantilla sobre vista.

**v2 — ISLR + IGTF ampliado**
- [ ] Retención ISLR: tabla SENIAT 001-086 (data precargada), tramos en UT, sustraendo, comprobante + XML mensual (ISO-8859-1).
- [ ] IGTF en ambas direcciones (gasto propio en divisas + percepción 3% SPE) — nuestro motor ya cobra IGTF en ventas; falta el lado gasto/retención.
- [ ] Notas de crédito/débito fiscales con documento afectado (02/03).
- [ ] Retención sobre notas de crédito (devoluciones) — ver §5.
- [ ] Bloqueo de días fiscales (`fiscal_lock_days` de Binaural) y modo contingencia de libros (bwealthics).

**v3 — Opcional por demanda**
- [ ] Municipal (patente de industria y comercio, mínimo en MMV — por ordenanza).
- [ ] Conector de imprenta digital (interfaz con proveedor autorizado, patrón bwealthics `einvoice` con proveedor simulado para dev).
- [ ] Exportadores por alcaldía (patrón LVE: un archivo por formato).

**Arquitectura (decidida)**: `fiscalPlugin({ enabled })` in-repo — colecciones propias (`fiscal-rate-lists`, `withholdings`, `withholding-declarations`, campos inyectados en clientes/proveedores/facturas), hooks compuestos, jobs para el cálculo, flag de activación **por inquilino**, tasas y formatos como data. Apagar el plugin = config intacta.

---

## 3. Tesorería liviana + MacroDroid — inspiración y diseño

**Inspiración (UX moderna de conciliación)**: Zoho Books (bank feeds con vista única de saldos/pendientes/matched, auto-recepción de extractos desde email, match masivo, **match de pagos parciales e intereses**, detección/exclusión de duplicados, categorización por reglas), Wave (feed simple con "confirm"), Mercury (cash management con visibilidad multi-cuenta), Agicap (proyección de flujo). Común denominador moderno: **el sistema propone, el humano confirma con un clic**.

**Diseño para Empresarial (multimoneda, adaptado VE)**:
- `BankAccounts` (inquilino, banco, número, moneda) + `BankMovements` (fecha, monto, moneda, referencia, `rawPayload` jsonb, `source` = `macrodroid`/`import`/`manual`, `status` = `unmatched`/`proposed`/`matched`/`ignored`). Idempotencia por hash (cuenta+fecha+monto+referencia).
- **Webhook MacroDroid** (verificado: trigger SMS/Notificación → regex → HTTP POST JSON con headers): endpoint raíz de Payload con token por dispositivo (patrón Stripe oficial), por banco. El pago móvil/Zelle del vendedor de la calle concilia solo.
- **Motor de matching puro** (testeable): por monto ±tolerancia, ventana de fecha ±3 días, referencia que contenga número de factura → **propone** liquidación → confirmación crea el `CustomerPayment` con allocation FIFO existente. Auto-confirmar opcional por tenant.
- Fase 2: importación de extracto por banco (arrancar por Mercantil/Banesco — formatos que LVE ya implementa) + conciliación formal (saldo banco vs. libros).
- Contenedor: `treasuryPlugin({ enabled })` con flag por inquilino. Las dos fuentes (webhook y extracto) alimentan la misma tabla.

---

## 4. Expediente de Personal (nómina-liviana) — también plugin

Referencia: el lado HRIS de Gusto/Rippling/OnPay — perfiles, timeline, documentos,
time-off; **cero cálculos**. `hrPlugin({ enabled })`:
- `Employees`: foto, cédula, RIF, nº IVSS, ingreso, cargo, departamento, contrato, banco/cuenta, contacto, estado (activo/reposo/vacaciones/inactivo).
- `EmploymentEvents`: ingreso, aumento salarial (historial de salarios gratis), cambio de cargo, reposo médico, vacaciones disfrutadas, bono/cesta ticket entregada, notas.
- `EmployeeDocuments`: contratos/constancias/evaluaciones (Media existente).
- UI visual: grid de tarjetas + chips de estado + KPIs (headcount, cumpleaños, antigüedad como display).
- Explícito NO: FAOV/INCES/IVSS calculados, prestaciones, nómina. Si algún día existe nómina real, este módulo ya es su master data (bwealthics `payroll` valida el alcance futuro: IVSS, RPE, FAOV, INCES, AR-I, CEPP, cesta ticket, recibo bimonetario).

---

## 5. Auditoría de plugins del sistema (estado actual)

**In-repo (patrón curried con `enabled`)** — 3:
1. `salesInventoryPlugin` — acoplamiento venta/compra ↔ kardex (`src/plugins/salesInventory.ts`).
2. `pricingPlugin` — snapshot de tasa y price-history (`src/plugins/pricing.ts`).
3. `auditPlugin` — bitácora con diff y snapshot sobre 10 colecciones (`src/plugins/audit.ts`).

**Oficiales en `payload.config.ts`**: `multiTenantPlugin`, `importExportPlugin`, `s3Storage`, email (Resend/nodemailer), Lexical, i18n.

**Honestidad arquitectónica**: SÍ respetamos la constitución (AGENTS.md §2.1) — el acoplamiento cruz de dominios (venta→inventario) es plugin; la lógica de un solo dominio vive en sus colecciones + utilities puras (`cashLedger`, `financeLedger`, `inventoryLedger` en `src/utilities/`). Lo que viene (fiscal, treasury, HR) NACE como plugin desde el día uno. Con Payload 4 en camino (admin redesign, adaptador TanStack, MCP — plugins siguen siendo el contrato central), mantener todo a nivel config/hooks garantiza migración barata.

**Roadmap de plugins del sistema**: 3 existentes + `treasuryPlugin` (siguiente) + `hrPlugin` + `fiscalPlugin` (luego) + futuro `storefrontPlugin` (ver §6) + futuro `payrollPlugin` (si el mercado lo pide).

---

## 6. Adiciones y veredictos del plan (debate de esta conversación)

| Tema | Veredicto | Detalle |
|---|---|---|
| **POS avanzado: scanner** | ✅ Planeado | PR 2 de Implementaciones Estructurales (escáner, F2/F4, vuelto). |
| **POS avanzado: devoluciones parciales** | ✅ **YA EXISTE** | `ReturnModal` permite cantidades parciales por línea (input ≤ cantidad vendida) y `createSaleReturnAction` genera los movimientos de kardex. No era deuda. |
| **POS avanzado: etiquetas** | Diferido P3 | Reporte de etiquetas con código de barras (patrón pos-improvements) — post PWA. |
| **Sprint "retenciones y devoluciones"** | Asignado | Devoluciones: hecha. Retenciones (incluida la retención sobre notas de crédito): vive dentro del plugin fiscal v1/v2 (§2), no como sprint suelto — así no se duplica el motor. |
| **Contabilidad** | Descartada | Por decisión del usuario. El sustituto útil: tesorería liviana (§3). |
| **CRM** | Enriquecer un poco | El CRM actual (clientes + cartera) puede sumar barato: notas/actividades en el perfil y último contacto — dentro del pulido continuo, sin módulo nuevo. |
| **Inbox WhatsApp + Instagram** | Diferido → **diseño cerrado (§7)** | Módulo real y vendible vía **Composio** (decisión: se usa Composio para todo lo externo). V1 WhatsApp, v2 Instagram. |
| **Conexión a página web / e-commerce** | Viable y sencillo, diferido → **diseño cerrado (§8)** | `storefrontPlugin`: catálogo público por tenant reutilizando el patrón share + pedidos que caen al módulo Orders existente. Sin pagos online en v1. |
| **Redes sociales (publicación)** | Descartada | Se desvía del núcleo. |
| **Composio SDK (login/integraciones)** | Planeado para luego | Capa futura de integraciones gestionadas (OAuth de terceros por tenant vía Composio). Evaluar cuando llegue `inboxPlugin`/`storefrontPlugin`. |
| **Nómina** | Plugin futuro | Expediente de Personal primero (§4); motor de cálculo solo si el mercado lo exige. |

---

## 7. inboxPlugin — arquitectura cerrada con Composio (verificada en docs oficiales, sep-2026)

**Decisión de plataforma**: todo lo externo pasa por Composio (OAuth, tokens, refresh,
delivery de triggers, firma, logs — SOC 2 / ISO 27001). Nada de OpenBSP ni protocolos no
oficiales de WhatsApp Web: Meta banea números por automatización no oficial, y la vía
WABA/Cloud API es la única durable para un negocio.

**Modelo Composio verificado** (toolkit WhatsApp: 17 tools + 1 trigger; Instagram con
OAuth Business Login):

- Enviar: mensaje, plantilla aprobada, media, contactos, botones interactivos (hasta 3),
  listas (menú), ubicación. Ciclo completo de plantillas (crear/listar/estado/eliminar).
- Media entrante: "Get media info" entrega URL de descarga → se archiva en nuestro S3.
- **No existe tool de historial** (ni en la Cloud API de Meta): el corpus de
  conversaciones se construye guardando cada entrante (trigger → webhook) y cada saliente
  (lo enviamos nosotros) en `InboxMessages`. Ese registro propio es el insumo de futuro
  análisis de sentimiento (no hay historia retroactiva en ninguna plataforma).
- Proxy Execute = llamada cruda a endpoints Meta no envueltos como tool (plano de
  escape; el diseño no lo requiere).
- Pricing: free tier por cuenta Composio (100.000 tool calls/mes + hasta 1.000
  conexiones), luego $0.10/conexión.

**Modelo por inquilino (decisión)**: un **proyecto Composio por tenant** con su propia
API key. Cada empresa consume su propio free tier y paga su excedente — coste
infraestructura para nosotros: cero. En Tenants se inyecta el grupo
`integrations.composio` (`projectId`, `apiKey`, `webhookSecret`), configurado solo por
super-admin. El cliente jamás ve una credencial.

**Flujo sin saturación**:

1. El proyecto Composio de cada tenant apunta su webhook a
   `/api/webhooks/composio/[tenantId]` (endpoint raíz, patrón Stripe oficial).
2. Handler: verifica firma con el `webhookSecret` del tenant
   (`composio.triggers.parse(body, headers, verifySecret)`), responde 200 en
   milisegundos y **encola** `processInboxMessage` en la Jobs Queue de Payload. Los
   reintentos de Composio cubren caídas; Composio gestiona delivery + retries + firma.
3. El job hace lo pesado: match teléfono→Customer, upsert de `InboxThread`, inserción de
   `InboxMessages`, descarga de media, enriquecimientos (sentimiento = job opcional
   futuro). Idempotencia: índice único por ID de mensaje Composio.
4. Límites Meta por WABA quedan aislados naturalmente (un proyecto por tenant).

**Colecciones del plugin**: `InboxThreads` (tenant, customer, canal whatsapp/instagram,
último mensaje, unread) e `InboxMessages` (thread, dirección, texto, media ref, IDs
externos, timestamps). UI: `/erp/inbox` (threads por cliente, composer con ventana 24h +
plantillas), item de sidebar con badge. Los botones share existentes (wa.me) evolucionan
a **envío real desde el número del negocio** vía Composio.

**v1 (WhatsApp, ~3 sprints)**: PoC previo de 1 día (WABA demo → trigger firmado →
webhook). **v2 (+1 sprint)**: Instagram DMs (PoC de trigger de DMs requerido). IA
(respuestas sugeridas vía MCP/Tool Router + LLM): decisión posterior sin re-arquitectura.

## 8. storefrontPlugin — arquitectura cerrada

El plugin solo inyecta config/campos (patrón oficial); las páginas son capa Next.js:

- **Inyecta en Tenants**: `storefrontConfig` (enabled, hero, WhatsApp de contacto,
  instrucciones de pago, mostrar stock). **Inyecta en Products**: `storefrontVisible`,
  `storefrontPriceUSD` (opcional), `imageUrls` (array de URLs).
- **Catálogo masivo sin módulo nuevo**: el `importExportPlugin` oficial ya corre sobre
  Products — el cliente descarga su CSV, llena `imageUrls` (URLs de fotos externas) y lo
  sube. "Excel con imágenes en URL" resuelto con lo que existe.
- **Páginas públicas** (RSC + Local API, patrón de las páginas share): `/t/[slug]`
  (catálogo con cards, badge "sin stock") + `/t/[slug]/producto/[id]`. Cacheable, SEO
  mínimo.
- **Carrito**: client-side (localStorage) → checkout nombre + teléfono → server action
  con Zod crea/halla el Customer por teléfono y genera un **Order** con `channel: 'web'`
  en pendiente — cae al módulo de pedidos existente y opcionalmente dispara el flujo
  WhatsApp de confirmación.
- Sin pagos online en v1 (transferencia/pago móvil + WhatsApp para cerrar). Widget de
  WhatsApp en la web (visitor → inbox del ERP) como pieza natural del mismo plugin.
- Costo: ~2-3 sprints, construible en paralelo con el inbox.

## 9. Orden sugerido de ejecución (después de los 7 PRs aprobados)

1. **TreasuryPlugin v1** — MacroDroid + matching (2-3 sprints, más valor inmediato).
2. **HrPlugin** — Expediente de Personal (1.5-2 sprints).
3. **FiscalPlugin v1** — previo: sprint de investigación (formatos 99035/XML reales + contador) (3-4 sprints).
4. Storefront / Inbox / Fiscal v2+ — según demanda de clientes.
