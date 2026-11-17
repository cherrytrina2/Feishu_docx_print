import { bitable, FieldType, type ITable, type IRecordValue } from '@lark-base-open/js-sdk';
import {
  DEFAULT_FILE_NAME_PATTERN,
  type StoredTemplate,
  type TemplateFolder,
  type TemplateMeta,
} from '../types';

const TEMPLATE_TABLE_NAME = '模板库';
const FOLDER_TABLE_NAME = '模板文件夹';
const FIELD_NAME = '模板名称';
const FIELD_FILE = '模板文件';
const FIELD_MAPPINGS = '映射配置';
const FIELD_FILE_NAME_PATTERN = '导出命名规则';
const FIELD_FOLDER_ID = '文件夹ID';
const FIELD_FOLDER_NAME = '文件夹名称';

type FieldIds = {
  name: string | null;
  file: string | null;
  mappings: string | null;
  fileNamePattern: string | null;
  folderId: string | null;
};

/**
 * 获取模板库表。读取场景绝不创建表，避免普通协作者打开模板库时因无建表权限报错。
 * 仅上传模板时才允许创建或补充字段。
 */
async function getOrCreateTemplateTable(createIfMissing = false): Promise<ITable | null> {
  const result = await bitable.base.getTableList();
  const tables = Array.isArray(result) ? result : [];
  let table: ITable | undefined;
  for (const candidate of tables) {
    if (await candidate.getName() === TEMPLATE_TABLE_NAME) {
      table = candidate;
      break;
    }
  }
  if (!table) {
    if (!createIfMissing) return null;
    const created = await bitable.base.addTable({
      name: TEMPLATE_TABLE_NAME,
      fields: [
        { name: FIELD_NAME, type: FieldType.Text },
        { name: FIELD_FILE, type: FieldType.Attachment },
        { name: FIELD_MAPPINGS, type: FieldType.Text },
        { name: FIELD_FILE_NAME_PATTERN, type: FieldType.Text },
        { name: FIELD_FOLDER_ID, type: FieldType.Text },
      ],
    });
    return bitable.base.getTableById(created.tableId);
  }
  await ensureTextFields(table, [FIELD_MAPPINGS, FIELD_FILE_NAME_PATTERN, FIELD_FOLDER_ID]);
  return table;
}

/** 一级文件夹独立存表；查看者只读，不会尝试创建。 */
async function getOrCreateFolderTable(createIfMissing = false): Promise<ITable | null> {
  const result = await bitable.base.getTableList();
  const tables = Array.isArray(result) ? result : [];
  let table: ITable | undefined;
  for (const candidate of tables) {
    if (await candidate.getName() === FOLDER_TABLE_NAME) {
      table = candidate;
      break;
    }
  }
  if (!table) {
    if (!createIfMissing) return null;
    const created = await bitable.base.addTable({
      name: FOLDER_TABLE_NAME,
      fields: [{ name: FIELD_FOLDER_NAME, type: FieldType.Text }],
    });
    return bitable.base.getTableById(created.tableId);
  }
  await ensureTextFields(table, [FIELD_FOLDER_NAME]);
  return table;
}

async function ensureTextFields(table: ITable, requiredNames: string[]): Promise<void> {
  const result = await table.getFieldMetaList();
  const names = new Set(
    (Array.isArray(result) ? result : [])
      .filter((field) => field && typeof field.name === 'string')
      .map((field) => field.name),
  );
  for (const name of requiredNames) {
    if (!names.has(name)) await table.addField({ name, type: FieldType.Text });
  }
}

async function findFieldId(table: ITable, fieldName: string): Promise<string | null> {
  // 新增字段后，字段列表在部分 Base 中会有短暂缓存；按名称直接取字段可避免
  // 因为“刚新增字段还没出现在 getFieldMetaList”而误判上传不可用。
  try {
    const field = await table.getFieldByName(fieldName);
    if (field?.id) return field.id;
  } catch {
    // 兼容旧 SDK 或字段不存在时，再尝试字段元信息列表。
  }
  const result = await table.getFieldMetaList();
  const fields = Array.isArray(result) ? result : [];
  return fields.find((field) => field?.name === fieldName)?.id ?? null;
}

async function getTemplateFieldIds(table: ITable): Promise<FieldIds> {
  const [name, file, mappings, fileNamePattern, folderId] = await Promise.all([
    findFieldId(table, FIELD_NAME),
    findFieldId(table, FIELD_FILE),
    findFieldId(table, FIELD_MAPPINGS),
    findFieldId(table, FIELD_FILE_NAME_PATTERN),
    findFieldId(table, FIELD_FOLDER_ID),
  ]);
  return { name, file, mappings, fileNamePattern, folderId };
}

function extractFieldText(fields: Record<string, unknown>, fieldId: string | null): string {
  if (!fieldId) return '';
  const value = fields?.[fieldId];
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(extractTextPart).filter(Boolean).join('').trim();
  return extractTextPart(value).trim();
}

function extractTextPart(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.text ?? record.name ?? record.content ?? '');
  }
  return '';
}

function extractMappingsField(fields: Record<string, unknown>, fieldId: string | null): Record<string, string> {
  const raw = extractFieldText(fields, fieldId);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
      ) as Record<string, string>;
    }
  } catch {
    // 兼容历史的非 JSON 映射值。
  }
  return {};
}

function extractAttachmentInfo(
  fields: Record<string, unknown>,
  fileFieldId: string | null,
): { token: string; fieldId: string } | null {
  if (!fileFieldId || !Array.isArray(fields?.[fileFieldId])) return null;
  for (const value of fields[fileFieldId] as unknown[]) {
    if (!value || typeof value !== 'object') continue;
    const token = (value as Record<string, unknown>).token;
    if (typeof token === 'string' && token) return { token, fieldId: fileFieldId };
  }
  return null;
}

function sameMappings(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function normalizePattern(value: string | undefined): string {
  return value?.trim() || DEFAULT_FILE_NAME_PATTERN;
}

/** 列出所有一级文件夹（包括尚未放模板的空文件夹）。 */
export async function listCloudTemplateFolders(): Promise<TemplateFolder[]> {
  try {
    const table = await getOrCreateFolderTable(false);
    // 首次由有编辑权限的成员上传时才创建文件夹表；其他成员可正常查看已有模板。
    if (!table) return [];
    const nameFieldId = await findFieldId(table, FIELD_FOLDER_NAME);
    if (!nameFieldId) throw new Error('模板文件夹表缺少“文件夹名称”字段');
    const response = await table.getRecords({ pageSize: 500 });
    const records = Array.isArray(response?.records) ? response.records : [];
    return records
      .map((record) => ({
        id: record.recordId,
        name: record.fields ? extractFieldText(record.fields, nameFieldId) : '',
        createdAt: Date.now(),
      }))
      .filter((folder) => Boolean(folder.id && folder.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  } catch (error) {
    throw new Error('读取模板文件夹失败：' + (error instanceof Error ? error.message : String(error)));
  }
}

/** 新建一级文件夹，重名时给出明确提示。 */
export async function createCloudTemplateFolder(rawName: string): Promise<TemplateFolder> {
  const name = rawName.trim();
  if (!name) throw new Error('请输入文件夹名称');
  if (name.length > 60) throw new Error('文件夹名称不能超过 60 个字符');
  const table = await getOrCreateFolderTable(true);
  if (!table) throw new Error('无法创建模板文件夹表');
  const nameFieldId = await findFieldId(table, FIELD_FOLDER_NAME);
  if (!nameFieldId) throw new Error('模板文件夹表缺少“文件夹名称”字段');
  const folders = await listCloudTemplateFolders();
  if (folders.some((folder) => folder.name === name)) throw new Error('已存在同名文件夹');
  const id = await table.addRecord({
    fields: { [nameFieldId]: [{ type: 'text', text: name }] },
  } as unknown as IRecordValue);
  return { id, name, createdAt: Date.now() };
}

/** 列出云端模板；旧模板没有文件夹时仍可在“全部文件夹”中查看。 */
export async function listCloudTemplates(): Promise<TemplateMeta[]> {
  try {
    const table = await getOrCreateTemplateTable(false);
    if (!table) return [];
    const fieldIds = await getTemplateFieldIds(table);
    if (!fieldIds.name || !fieldIds.file) throw new Error('模板库表缺少必要字段（模板名称/模板文件）');
    const response = await table.getRecords({ pageSize: 500 });
    const records = Array.isArray(response?.records) ? response.records : [];
    const templates: TemplateMeta[] = [];
    for (const record of records) {
      if (!record?.recordId || !record.fields || !extractAttachmentInfo(record.fields, fieldIds.file)) continue;
      templates.push({
        id: record.recordId,
        name: extractFieldText(record.fields, fieldIds.name) || '未命名模板',
        isBuiltin: false,
        createdAt: Date.now(),
        fieldMappings: extractMappingsField(record.fields, fieldIds.mappings),
        fileNamePattern: normalizePattern(extractFieldText(record.fields, fieldIds.fileNamePattern)),
        folderId: extractFieldText(record.fields, fieldIds.folderId) || undefined,
      });
    }
    return templates;
  } catch (error) {
    throw new Error('读取云端模板库失败：' + (error instanceof Error ? error.message : String(error)));
  }
}

/** 下载云端模板以及与它绑定的映射、命名规则。 */
export async function getCloudTemplate(id: string): Promise<StoredTemplate | undefined> {
  try {
    const table = await getOrCreateTemplateTable(false);
    if (!table) return undefined;
    const record = await table.getRecordById(id);
    if (!record?.fields) return undefined;
    const fieldIds = await getTemplateFieldIds(table);
    if (!fieldIds.name || !fieldIds.file) return undefined;
    const attachment = extractAttachmentInfo(record.fields, fieldIds.file);
    if (!attachment) return undefined;
    const url = await table.getAttachmentUrl(attachment.token, attachment.fieldId, id);
    if (!url) return undefined;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`附件下载失败 HTTP ${response.status}`);
    return {
      id,
      name: extractFieldText(record.fields, fieldIds.name) || '未命名模板',
      isBuiltin: false,
      buffer: await response.arrayBuffer(),
      createdAt: Date.now(),
      fieldMappings: extractMappingsField(record.fields, fieldIds.mappings),
      fileNamePattern: normalizePattern(extractFieldText(record.fields, fieldIds.fileNamePattern)),
      folderId: extractFieldText(record.fields, fieldIds.folderId) || undefined,
    };
  } catch (error) {
    throw new Error('下载模板失败：' + (error instanceof Error ? error.message : String(error)));
  }
}

/** 上传模板、映射和命名规则到指定一级文件夹。 */
export async function saveCloudTemplate(
  name: string,
  buffer: ArrayBuffer,
  fieldMappings: Record<string, string>,
  fileNamePattern: string,
  folderId: string,
): Promise<string> {
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) throw new Error('请选择要上传到的文件夹');
  try {
    const table = await getOrCreateTemplateTable(true);
    if (!table) throw new Error('无法创建模板库表');
    const fieldIds = await getTemplateFieldIds(table);
    if (!fieldIds.name || !fieldIds.file || !fieldIds.mappings || !fieldIds.fileNamePattern || !fieldIds.folderId) {
      throw new Error('模板库表缺少必要字段，请刷新后重试');
    }
    const fileName = name.toLowerCase().endsWith('.docx') ? name : `${name}.docx`;
    const file = new File([buffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const tokens = await bitable.base.batchUploadFile([file]);
    const fileToken = Array.isArray(tokens) ? tokens[0] : undefined;
    if (!fileToken) throw new Error('文件上传失败');
    const mappings = fieldMappings ?? {};
    const pattern = normalizePattern(fileNamePattern);
    const recordId = await table.addRecord({
      fields: {
        [fieldIds.name]: [{ type: 'text', text: name }],
        [fieldIds.file]: [{ token: fileToken, name: fileName, size: buffer.byteLength, type: 'docx', timeStamp: Date.now() }],
        [fieldIds.mappings]: [{ type: 'text', text: JSON.stringify(mappings) }],
        [fieldIds.fileNamePattern]: [{ type: 'text', text: pattern }],
        [fieldIds.folderId]: [{ type: 'text', text: normalizedFolderId }],
      },
    } as unknown as IRecordValue);
    const saved = await table.getRecordById(recordId);
    if (!saved?.fields ||
      !sameMappings(extractMappingsField(saved.fields, fieldIds.mappings), mappings) ||
      extractFieldText(saved.fields, fieldIds.fileNamePattern) !== pattern ||
      extractFieldText(saved.fields, fieldIds.folderId) !== normalizedFolderId) {
      throw new Error('模板已上传，但配置回读不一致，请重试');
    }
    return recordId;
  } catch (error) {
    throw new Error('上传模板失败：' + (error instanceof Error ? error.message : String(error)));
  }
}

export async function deleteCloudTemplate(id: string): Promise<void> {
  try {
    const table = await getOrCreateTemplateTable(false);
    if (!table) throw new Error('模板库不存在');
    await table.deleteRecord(id);
  } catch (error) {
    throw new Error('删除模板失败：' + (error instanceof Error ? error.message : String(error)));
  }
}
