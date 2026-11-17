import { bitable, FieldType } from '@lark-base-open/js-sdk';
import type { IFieldMeta, IRecordValue } from '@lark-base-open/js-sdk';
import { normalizeFieldValue } from './valueNormalizer';

export interface RelatedRecordOptions {
  maxRecords?: number;
}

/** Expand a linked-record cell into rows that can be used by {#items} loops. */
export async function loadRelatedRecords(
  fieldMeta: IFieldMeta,
  rawValue: unknown,
  options: RelatedRecordOptions = {},
): Promise<Record<string, unknown>[]> {
  const tableId = getRelatedTableId(fieldMeta);
  const recordIds = extractRecordIds(rawValue);
  if (!tableId || recordIds.length === 0) return [];

  const maxRecords = options.maxRecords ?? 200;
  const relatedTable = await bitable.base.getTableById(tableId);
  const relatedMetaResult = await relatedTable.getFieldMetaList();
  const relatedMeta = Array.isArray(relatedMetaResult) ? relatedMetaResult : [];
  const recordsResult = await relatedTable.getRecordsByIds(recordIds.slice(0, maxRecords), true);
  const records = Array.isArray(recordsResult) ? recordsResult : [];

  return records.map((record) => normalizeRelatedRecord(record, relatedMeta));
}

export function extractRecordIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of values) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const rawIds = record.recordIds ?? record.record_ids;
    if (Array.isArray(rawIds)) ids.push(...rawIds.filter((id): id is string => typeof id === 'string'));
    for (const key of ['recordId', 'record_id', 'id']) {
      const id = record[key];
      if (typeof id === 'string') ids.push(id);
    }
  }
  return [...new Set(ids)];
}

function getRelatedTableId(fieldMeta: IFieldMeta): string | undefined {
  const property = (fieldMeta as IFieldMeta & { property?: { tableId?: string } }).property;
  return property?.tableId;
}

function normalizeRelatedRecord(record: IRecordValue, fieldMeta: IFieldMeta[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const meta of fieldMeta) {
    if (!meta || meta.type === FieldType.Attachment) continue;
    const raw = record.fields?.[meta.id];
    row[meta.name] = normalizeFieldValue(meta.type, raw);
  }
  return row;
}
