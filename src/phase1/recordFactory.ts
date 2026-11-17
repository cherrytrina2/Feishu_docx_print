import { FieldType, type IFieldMeta, type ITable } from '@lark-base-open/js-sdk';
import { fetchAttachmentBuffers } from '../services/attachmentService';
import { loadRelatedRecords } from '../core/relationLoader';
import { normalizeFieldValue } from '../core/valueNormalizer';
import type { ParsedField, RecordRenderData } from '../types';

function isLinkedField(meta: IFieldMeta): boolean {
  return meta.type === FieldType.SingleLink || meta.type === FieldType.DuplexLink;
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof ArrayBuffer) return `[二进制 ${value.byteLength}B]`;
  if (ArrayBuffer.isView(value)) return `[二进制 ${value.byteLength}B]`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return `关联 ${value.length} 条`;
    }
    return value.map((item) => formatDisplayValue(item)).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = record.text ?? record.name ?? record.content ?? record.address ?? record.full_name;
    if (typeof text === 'string' && text) return text;
    try {
      return JSON.stringify(record);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildLabel(fields: ParsedField[], recordId: string): string {
  const preferredNames = ['Bondex编号', '主单号', '分单号', '货代编号', '发票号', '业务编号'];
  const labelField = fields.find(
    (field) => preferredNames.includes(field.name) && field.displayValue && field.displayValue.length < 60,
  ) ?? fields.find(
    (field) =>
      !field.isImage &&
      field.displayValue &&
      field.displayValue.length < 40 &&
      !field.displayValue.startsWith('关联 '),
  );
  return labelField ? `${labelField.name}: ${labelField.displayValue}` : recordId.slice(-8);
}

/** Build a render-ready record model with typed values preserved for later extension. */
export async function buildRecordRenderData(
  table: ITable,
  fieldMetaList: IFieldMeta[],
  recordId: string,
): Promise<RecordRenderData> {
  const record = await table.getRecordById(recordId);
  if (!record) {
    return { data: {}, fields: [], recordId, label: recordId };
  }

  const fields: ParsedField[] = [];
  const data: Record<string, unknown> = {};

  const attachmentTasks: Array<{
    meta: IFieldMeta;
    promise: Promise<ArrayBuffer[]>;
  }> = [];

  const linkedTasks: Array<{
    meta: IFieldMeta;
    rawValue: unknown;
  }> = [];

  for (const meta of fieldMetaList) {
    if (!meta) continue;

    if (meta.type === FieldType.Attachment) {
      const raw = record.fields?.[meta.id];
      attachmentTasks.push({
        meta,
        // 飞书 SDK 的 getAttachmentUrls 会对附件值直接调用 map；空附件返回 null
        // 时会在 SDK 内部抛出 “Cannot read properties of null (reading 'map')”。
        // 先检查原始单元格，空值不进入 SDK；附件下载失败也不影响整条记录读取。
        promise: hasAttachmentValues(raw)
          ? fetchAttachmentBuffers(table, meta.id, recordId).catch(() => [])
          : Promise.resolve([]),
      });
      continue;
    }

    if (isLinkedField(meta)) {
      linkedTasks.push({
        meta,
        rawValue: record.fields?.[meta.id],
      });
      continue;
    }

    const raw = record.fields?.[meta.id];
    const normalized = normalizeFieldValue(meta.type, raw);
    const displayValue = formatDisplayValue(normalized);

    data[meta.name] = normalized;
    fields.push({
      fieldId: meta.id,
      name: meta.name,
      type: meta.type,
      isImage: false,
      placeholder: `{${meta.name}}`,
      displayValue,
    });
  }

  for (const task of linkedTasks) {
    const name = task.meta.name;
    const raw = task.rawValue;
    let displayValue = formatDisplayValue(normalizeFieldValue(task.meta.type, raw));
    try {
      const relatedRows = await loadRelatedRecords(task.meta, raw, { maxRecords: 200 });
      if (relatedRows.length > 0) {
        data[name] = relatedRows;
        displayValue = `关联 ${relatedRows.length} 条`;
      } else {
        data[name] = normalizeFieldValue(task.meta.type, raw);
      }
    } catch {
      data[name] = normalizeFieldValue(task.meta.type, raw);
    }

    fields.push({
      fieldId: task.meta.id,
      name,
      type: task.meta.type,
      isImage: false,
      placeholder: `{#${name}}...{/${name}}`,
      displayValue,
    });
  }

  for (const task of attachmentTasks) {
    const buffersResult = await task.promise.catch(() => []);
    const buffers = Array.isArray(buffersResult) ? buffersResult : [];
    const name = task.meta.name;
    if (buffers.length > 0) {
      data[name] = buffers[0];
      fields.push({
        fieldId: task.meta.id,
        name,
        type: task.meta.type,
        isImage: true,
        placeholder: `{%${name}}`,
        displayValue: `[图片 ×${buffers.length}]`,
      });
    } else {
      data[name] = '';
      fields.push({
        fieldId: task.meta.id,
        name,
        type: task.meta.type,
        isImage: true,
        placeholder: `{%${name}}`,
        displayValue: '[无图片]',
      });
    }
  }

  return {
    data,
    fields,
    recordId,
    label: buildLabel(fields, recordId),
  };
}

function hasAttachmentValues(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => item && typeof item === 'object');
}
