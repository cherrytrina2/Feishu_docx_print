import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredTemplate, TemplateMeta } from '../types';

interface TemplateLibraryDB extends DBSchema {
  templates: {
    key: string;
    value: StoredTemplate;
    indexes: { 'by-name': string };
  };
}

const DB_NAME = 'invoice-plugin-library-db';
const DB_VERSION = 1;
const STORE = 'templates';

let dbPromise: Promise<IDBPDatabase<TemplateLibraryDB>> | null = null;

function getDB(): Promise<IDBPDatabase<TemplateLibraryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TemplateLibraryDB>(DB_NAME, DB_VERSION, {
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

export async function listLibraryTemplates(): Promise<TemplateMeta[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return all
    .map((t) => ({
      id: t.id,
      name: t.name,
      isBuiltin: t.isBuiltin,
      createdAt: t.createdAt,
      fieldMappings: t.fieldMappings ?? {},
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getLibraryTemplate(id: string): Promise<StoredTemplate | undefined> {
  const db = await getDB();
  return db.get(STORE, id);
}

export interface NewLibraryTemplateInput {
  name: string;
  buffer: ArrayBuffer;
  id?: string;
  fieldMappings?: Record<string, string>;
}

export async function saveLibraryTemplate(input: NewLibraryTemplateInput): Promise<string> {
  const db = await getDB();
  const id = input.id ?? genId();
  const record: StoredTemplate = {
    id,
    name: input.name,
    isBuiltin: false,
    buffer: input.buffer,
    createdAt: Date.now(),
    fieldMappings: input.fieldMappings ?? {},
  };
  await db.put(STORE, record);
  return id;
}

export async function deleteLibraryTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

function genId(): string {
  return 'lib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
