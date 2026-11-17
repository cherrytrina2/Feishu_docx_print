import type { FieldType } from '@lark-base-open/js-sdk';

/** 模板元信息（不含二进制，用于列表展示） */
export interface TemplateMeta {
  id: string;
  name: string;
  isBuiltin: boolean;
  createdAt: number;
  fieldMappings?: Record<string, string>;
  /** 导出文件名规则，不含扩展名，例如：运费发票-{主单号}-{分单号} */
  fileNamePattern?: string;
  /** 云端模板所属的一级文件夹；本地模板无需设置。 */
  folderId?: string;
}

/** 存储在 IndexedDB 中的完整模板（含二进制） */
export interface StoredTemplate extends TemplateMeta {
  buffer: ArrayBuffer;
}

/** 云端模板库中的一级文件夹。文件夹没有父级，避免形成难以维护的多层目录。 */
export interface TemplateFolder {
  id: string;
  name: string;
  createdAt: number;
}

/** 字段映射和导出命名规则作为同一份模板配置保存。 */
export interface TemplateSettings {
  fieldMappings: Record<string, string>;
  fileNamePattern: string;
}

export const DEFAULT_FILE_NAME_PATTERN = '运费发票-{主单号}-{分单号}';

/** 单个字段解析后的展示信息 */
export interface ParsedField {
  fieldId: string;
  name: string;
  type: FieldType;
  isImage: boolean;
  placeholder: string;
  displayValue: string;
}

/** 单条记录的渲染数据 */
export interface RecordRenderData {
  /** 给 docxtemplater.render() 的扁平对象 */
  data: Record<string, unknown>;
  /** 给 UI 展示的字段列表 */
  fields: ParsedField[];
  recordId: string;
  /** 记录标题（用于多条展示时的标签，如发票号码） */
  label: string;
}

/** 多条记录的渲染数据集合 */
export interface MultiRenderData {
  records: RecordRenderData[];
}

/** 渲染错误信息 */
export interface RenderErrorDetail {
  message: string;
  field?: string;
}

export type RenderResult =
  | { ok: true; blob: Blob }
  | { ok: false; errors: RenderErrorDetail[] };
