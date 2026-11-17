import { bitable } from '@lark-base-open/js-sdk';
import type { IFieldMeta, ITable } from '@lark-base-open/js-sdk';
import { buildRecordRenderData } from '../phase1';
import type { MultiRenderData, RecordRenderData } from '../types';

/**
 * Parse one record into a render-ready model.
 * This now goes through the phase1 factory so typed values and related rows
 * stay available for template validation and loop rendering.
 */
async function parseOneRecord(
  table: ITable,
  fieldMetaList: IFieldMeta[],
  recordId: string,
): Promise<RecordRenderData> {
  return buildRecordRenderData(table, fieldMetaList, recordId);
}

/**
 * Use the SDK selection dialog to pick multiple records.
 */
export async function selectMultipleRecords(): Promise<string[]> {
  const selection = await bitable.base.getSelection();
  if (!selection.tableId || !selection.viewId) {
    throw new Error('请先在多维表格中选中任意一条记录或单元格');
  }
  const result = await bitable.ui.selectRecordIdList(selection.tableId, selection.viewId);
  if (!result || !Array.isArray(result)) return [];
  return result;
}

/**
 * Load multiple records by record id list.
 */
export async function loadRecordsByIds(recordIds: string[]): Promise<MultiRenderData> {
  const ids = Array.isArray(recordIds) ? recordIds : [];
  if (ids.length === 0) return { records: [] };
  const table = await bitable.base.getActiveTable();
  const fieldMetaResult = await table.getFieldMetaList();
  const fieldMetaList = Array.isArray(fieldMetaResult) ? fieldMetaResult : [];
  // 一条记录中的复杂字段异常不应阻断同次多选的其余记录。
  const records = await Promise.all(ids.map(async (id) => {
    try {
      return await parseOneRecord(table, fieldMetaList, id);
    } catch {
      return { data: {}, fields: [], recordId: id, label: id.slice(-8) };
    }
  }));
  return { records };
}

/**
 * Auto-load the currently selected single record.
 */
export async function loadCurrentRecord(): Promise<RecordRenderData | null> {
  const selection = await bitable.base.getSelection();
  const recordId = selection.recordId;
  if (!recordId) return null;
  const table = await bitable.base.getActiveTable();
  const fieldMetaResult = await table.getFieldMetaList();
  const fieldMetaList = Array.isArray(fieldMetaResult) ? fieldMetaResult : [];
  return parseOneRecord(table, fieldMetaList, recordId);
}

/**
 * Get current selection info for UI hints.
 */
export async function getCurrentSelectionInfo() {
  return bitable.base.getSelection();
}
