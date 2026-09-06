import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  CollectionSlug,
  Config,
  Plugin,
} from 'payload';
import { extractId } from '../utilities/inventoryLedger';

/**
 * ─── Audit Plugin (Sprint 12) ───────────────────────────────────────────────
 *
 * Bitácora de auditoría empresarial siguiendo el patrón canónico de plugins
 * ((options) => (config) => Config), según AGENTS.md §2.1:
 *
 *  1. Registra la colección `audit-log` (inmutable, multi-tenant).
 *  2. Compone en las colecciones objetivo los hooks `afterChange`/`afterDelete`
 *     que escriben un registro con actor, operación y diff de campos —
 *     PRESERVANDO los hooks existentes y propagando `req` (misma transacción:
 *     si el documento revierte, la auditoría revierte con él).
 *
 * El diff compara `originalDoc` (estado previo) contra `doc` (estado final),
 * normalizando relaciones a IDs. Campos técnicos y valores idénticos se omiten.
 */

export interface AuditPluginOptions {
  enabled?: boolean;
  /** Slugs de las colecciones a auditar. */
  collections?: string[];
  /** Slug de la colección de auditoría. */
  auditLogSlug?: string;
  /** Campos excluidos del diff (técnicos o ruidosos). */
  ignoreFields?: string[];
}

const DEFAULT_IGNORE = [
  'updatedAt',
  'createdAt',
  'updatedAt_str',
];

/** Normaliza un valor para comparación/serialización en el diff. */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    // Relación poblada → id
    if ('id' in (value as Record<string, unknown>)) {
      return normalizeValue((value as Record<string, unknown>).id);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeValue(v);
    }
    return out;
  }
  return value;
}

/** Diff superficial entre el doc previo y el final. */
function computeDiff(
  originalDoc: Record<string, unknown> | null | undefined,
  doc: Record<string, unknown>,
  ignoreFields: string[],
): Record<string, { old: unknown; new: unknown }> | undefined {
  if (!originalDoc) return undefined; // create: el doc completo ya está en el log

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([...Object.keys(doc), ...Object.keys(originalDoc)]);

  for (const key of keys) {
    if (ignoreFields.includes(key) || DEFAULT_IGNORE.includes(key)) continue;
    const oldVal = normalizeValue(originalDoc[key]);
    const newVal = normalizeValue(doc[key]);
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

export const auditPlugin =
  (options: AuditPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (options.enabled === false) {
      return incomingConfig;
    }

    const auditLogSlug = options.auditLogSlug ?? 'audit-log';
    const targetSlugs = options.collections ?? [];
    const ignoreFields = options.ignoreFields ?? [];

    const auditLogCollection: CollectionConfig = {
      slug: auditLogSlug,
      labels: {
        singular: 'Registro de Auditoría',
        plural: 'Auditoría',
      },
      admin: {
        useAsTitle: 'id',
        group: 'Administración',
        defaultColumns: ['createdAt', 'actor', 'collection', 'docId', 'operation'],
        description:
          'Bitácora inmutable escrita por auditPlugin: quién cambió qué, cuándo y con qué diff.',
      },
      access: {
        read: ({ req: { user } }) =>
          Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
        create: () => false, // Solo los hooks del plugin escriben (overrideAccess)
        update: () => false,
        delete: () => false,
      },
      fields: [
        {
          name: 'actor',
          label: 'Actor',
          type: 'relationship',
          relationTo: 'users',
          index: true,
          admin: {
            description: 'Usuario que realizó la operación (sistema si no aplica).',
          },
        },
        {
          name: 'actorRole',
          label: 'Rol del Actor',
          type: 'text',
        },
        {
          name: 'collection',
          label: 'Colección',
          type: 'text',
          required: true,
          index: true,
        },
        {
          name: 'docId',
          label: 'ID del Documento',
          type: 'number',
          required: true,
          index: true,
        },
        {
          name: 'operation',
          label: 'Operación',
          type: 'select',
          required: true,
          options: [
            { label: 'Creación', value: 'create' },
            { label: 'Actualización', value: 'update' },
            { label: 'Eliminación', value: 'delete' },
          ],
        },
        {
          name: 'diff',
          label: 'Campos Modificados (old → new)',
          type: 'json',
          admin: {
            description: 'Solo en updates: campos cuyo valor cambió.',
          },
        },
        {
          name: 'snapshot',
          label: 'Snapshot del Documento',
          type: 'json',
          admin: {
            description: 'Estado final del documento (create) o previo (delete).',
          },
        },
      ],
      timestamps: true,
    };

    // Hooks por colección: el slug viaja en el closure del factory
    const makeAuditAfterChange = (slug: string): CollectionAfterChangeHook => async ({
      doc,
      previousDoc,
      operation,
      req,
    }) => {
      if (req.context?.skipAuditLog) return doc;

      const typedDoc = doc as unknown as Record<string, unknown>;
      const typedOriginal = previousDoc as unknown as Record<string, unknown> | undefined;

      await req.payload.create({
        collection: auditLogSlug as CollectionSlug,
        data: {
          actor: req.user?.id ?? null,
          actorRole: req.user?.role || 'system',
          collection: slug,
          docId: Number(extractId(doc.id)) || 0,
          operation,
          diff: operation === 'update' ? computeDiff(typedOriginal, typedDoc, ignoreFields) : undefined,
          snapshot:
            operation === 'create'
              ? JSON.parse(JSON.stringify(typedDoc))
              : undefined,
        },
        req,
        overrideAccess: true,
      });

      return doc;
    };

    const makeAuditAfterDelete = (slug: string): CollectionAfterDeleteHook => async ({
      doc,
      req,
    }) => {
      if (req.context?.skipAuditLog) return doc;

      const typedDoc = doc as unknown as Record<string, unknown>;

      await req.payload.create({
        collection: auditLogSlug as CollectionSlug,
        data: {
          actor: req.user?.id ?? null,
          actorRole: req.user?.role || 'system',
          collection: slug,
          docId: Number(extractId(doc.id)) || 0,
          operation: 'delete',
          snapshot: JSON.parse(JSON.stringify(typedDoc)),
        },
        req,
        overrideAccess: true,
      });

      return doc;
    };

    const collections: CollectionConfig[] = (incomingConfig.collections || []).map(
      (collection) => {
        if (targetSlugs.includes(collection.slug)) {
          return {
            ...collection,
            hooks: {
              ...(collection.hooks || {}),
              afterChange: [
                makeAuditAfterChange(collection.slug),
                ...(collection.hooks?.afterChange || []),
              ],
              afterDelete: [
                makeAuditAfterDelete(collection.slug),
                ...(collection.hooks?.afterDelete || []),
              ],
            },
          };
        }
        return collection;
      },
    );

    return {
      ...incomingConfig,
      collections: [...collections, auditLogCollection],
    };
  };
