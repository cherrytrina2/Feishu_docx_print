import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_FILE_NAME_PATTERN,
  type StoredTemplate,
  type TemplateMeta,
  type TemplateSettings,
} from '../types';

interface TemplateDB extends DBSchema {
  templates: {
    key: string;
    value: StoredTemplate;
    indexes: { 'by-name': string };
  };
}

const DB_NAME = 'invoice-plugin-db';
const DB_VERSION = 1;
const STORE = 'templates';
const BUILTIN_TEMPLATE_ID = 'builtin-freight-invoice';
const BUILTIN_TEMPLATE_NAME = '运费发票模版';

let dbPromise: Promise<IDBPDatabase<TemplateDB>> | null = null;

function getDB(): Promise<IDBPDatabase<TemplateDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TemplateDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('by-name', 'name');
        }
      },
    });
  }
  return dbPromise;
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  const db = await getDB();
  const allResult = await db.getAll(STORE);
  const all = Array.isArray(allResult) ? allResult : [];
  return all
    .map((t) => ({
      id: t.id,
      name: t.name,
      isBuiltin: t.isBuiltin,
      createdAt: t.createdAt,
      fieldMappings: t.fieldMappings ?? {},
      fileNamePattern: t.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN,
    }))
    .sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
}

export async function getTemplate(id: string): Promise<StoredTemplate | undefined> {
  const db = await getDB();
  return db.get(STORE, id);
}

export interface NewTemplateInput {
  name: string;
  buffer: ArrayBuffer;
  isBuiltin?: boolean;
  id?: string;
  fieldMappings?: Record<string, string>;
  fileNamePattern?: string;
}

export async function saveTemplate(input: NewTemplateInput): Promise<string> {
  const db = await getDB();
  const id = input.id ?? genId();
  const record: StoredTemplate = {
    id,
    name: input.name,
    isBuiltin: input.isBuiltin ?? false,
    buffer: input.buffer,
    createdAt: Date.now(),
    fieldMappings: input.fieldMappings ?? {},
    fileNamePattern: normalizeFileNamePattern(input.fileNamePattern),
  };
  await db.put(STORE, record);
  return id;
}

export async function updateTemplateMappings(
  id: string,
  fieldMappings: Record<string, string>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE, id);
  if (!existing) throw new Error('模板不存在');
  await db.put(STORE, {
    ...existing,
    fieldMappings,
  });
}

/** 一次保存映射和命名规则，防止两项配置在上传模板库时出现不同步。 */
export async function updateTemplateSettings(
  id: string,
  settings: TemplateSettings,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE, id);
  if (!existing) throw new Error('模板不存在');
  await db.put(STORE, {
    ...existing,
    fieldMappings: settings.fieldMappings ?? {},
    fileNamePattern: normalizeFileNamePattern(settings.fileNamePattern),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE, id);
  if (existing?.isBuiltin) {
    throw new Error('内置模板不能删除');
  }
  await db.delete(STORE, id);
}

export async function ensureBuiltinTemplate(): Promise<void> {
  const response = await fetch('./templates/default-invoice.docx');
  if (!response.ok) {
    throw new Error(`内置模板加载失败 HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const db = await getDB();
  const existing = await db.get(STORE, BUILTIN_TEMPLATE_ID);

  await db.put(STORE, {
    id: BUILTIN_TEMPLATE_ID,
    name: BUILTIN_TEMPLATE_NAME,
    isBuiltin: true,
    buffer,
    createdAt: existing?.createdAt ?? 0,
    fieldMappings: existing?.fieldMappings ?? {},
    fileNamePattern: existing?.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN,
  });
}

function genId(): string {
  return 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeFileNamePattern(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_FILE_NAME_PATTERN;
}
