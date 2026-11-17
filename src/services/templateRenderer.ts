import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import dayjs from 'dayjs';
import type { RenderResult, RenderErrorDetail } from '../types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * 用 docxtemplater 把数据灌入 Word 模板，生成填好数据的 docx Blob。
 * - 文本占位符：{字段名}
 * - 图片占位符：{%字段名}（data[字段名] 须为 ArrayBuffer）
 * - 循环：{#items}...{/items}
 * - 条件：{#is_paid}已付款{/is_paid}{^is_paid}未付款{/is_paid}
 */
export function renderTemplate(
  templateBuffer: ArrayBuffer,
  data: Record<string, unknown>,
): RenderResult {
  return renderInternal(templateBuffer, data);
}

/**
 * 多条记录合并到同一页渲染：
 * - 文本字段：将各记录的值用逗号拼接（如 "A公司,B公司,C公司"）
 * - 循环字段（{#xxx}）：把各记录的数组合并成一个大数组（如费用明细行全部累加）
 * - 图片字段：取第一条记录的有效图片
 * 最终生成一份单页文档，所有选中记录的信息合并在同一张发票上。
 */
export function renderMergedTemplate(
  templateBuffer: ArrayBuffer,
  recordsData: Array<Record<string, unknown>>,
): RenderResult {
  if (!recordsData || recordsData.length === 0) {
    return { ok: false, errors: [{ message: '没有可合并的记录数据' }] };
  }

  try {
    const zip = new PizZip(templateBuffer);
    const loopFields = extractLoopFields(zip);
    const mergedData = mergeRecordsToSamePage(recordsData, loopFields);
    return renderInternal(templateBuffer, mergedData);
  } catch (e) {
    return { ok: false, errors: parseRenderErrors(e) };
  }
}

/**
 * 从任意值中提取可显示的文本。
 * - 对象数组（关联记录）：提取每条记录的第一个可用字段，用"、"连接
 * - 单对象：提取 text/name/content/title/address/full_name 等字段，或第一个字符串/数字值
 * - 其他类型：转字符串
 */
function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumberOrTimestamp(value);
  if (typeof value === 'boolean') return value ? '是' : '否';

  if (Array.isArray(value)) {
    const parts = value.map((v) => valueToText(v)).filter(Boolean);
    return parts.join('、');
  }

  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // 优先尝试常见的文本字段（中英文混合配置）
    const preferredKeys = [
      'text', 'name', 'content', 'title', 'label', 'value',
      'address', 'full_name', 'fullName', 'display',
    ];
    for (const key of preferredKeys) {
      const val = o[key];
      const text = scalarValueToString(val);
      if (text) return text;
    }
    // 遍历所有字段，找第一个可用的标量值
    for (const key of Object.keys(o)) {
      const val = o[key];
      const text = scalarValueToString(val);
      if (text) return text;
    }
    // 兜底：JSON（排除空对象）
    try {
      const json = JSON.stringify(o);
      return json && json !== '{}' ? json : '';
    } catch {
      return '';
    }
  }

  return String(value);
}

/** 把单个标量值转字符串（空值返回 ''） */
function scalarValueToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' && Number.isFinite(val)) return formatNumberOrTimestamp(val);
  if (typeof val === 'boolean') return val ? '是' : '否';
  return '';
}

function formatNumberOrTimestamp(value: number): string {
  if (Number.isFinite(value) && value > 946684800000 && value < 4102444800000) {
    const date = dayjs(value);
    if (date.isValid()) {
      return date.hour() === 0 && date.minute() === 0
        ? date.format('YYYY-MM-DD')
        : date.format('YYYY-MM-DD HH:mm');
    }
  }
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(4)));
}

/**
 * 将多条记录的数据合并到一个扁平对象中（用于同页渲染）。
 * - 循环字段：concat 所有记录的数组
 * - 图片字段（ArrayBuffer）：取第一条非空值
 * - 其他字段：用逗号拼接所有非空字符串值
 */
function mergeRecordsToSamePage(
  records: Array<Record<string, unknown>>,
  loopFields: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!records || records.length === 0) return result;

  // 收集所有出现过的 key
  const allKeys = new Set<string>();
  for (const r of records) {
    if (r) Object.keys(r).forEach((k) => allKeys.add(k));
  }

  for (const key of allKeys) {
    if (loopFields.has(key)) {
      // 循环字段：把所有记录的数组合并成一个长数组
      const merged: unknown[] = [];
      for (const r of records) {
        const val = r?.[key];
        if (Array.isArray(val)) {
          merged.push(...val);
        }
      }
      result[key] = merged;
      continue;
    }

    // 图片字段（ArrayBuffer）：取第一条非空图片
    let imageAssigned = false;
    const textValues: string[] = [];

    for (const r of records) {
      const val = r?.[key];
      if (val === null || val === undefined) continue;
      if (val instanceof ArrayBuffer) {
        if (!imageAssigned && val.byteLength > 0) {
          result[key] = val;
          imageAssigned = true;
        }
        continue;
      }
      if (val instanceof Uint8Array) {
        if (!imageAssigned && val.byteLength > 0) {
          result[key] = val;
          imageAssigned = true;
        }
        continue;
      }
      const str = valueToText(val);
      if (str) textValues.push(str);
    }

    // 非图片字段：用逗号拼接
    if (!imageAssigned) {
      result[key] = textValues.join(',');
    }
  }

  return result;
}

/**
 * 核心渲染函数（单条/合并共用）
 */
function renderInternal(
  templateBuffer: ArrayBuffer,
  data: Record<string, unknown>,
): RenderResult {
  try {
    const zip = new PizZip(templateBuffer);
    const modules = hasImagePlaceholders(zip) ? [createImageModule()] : [];

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules,
      nullGetter(_part: unknown, _scope: unknown) {
        return '';
      },
    });

    const safeData = normalizeData(data, zip);
    doc.render(safeData);

    const blob = doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME });
    return { ok: true, blob };
  } catch (e) {
    return { ok: false, errors: parseRenderErrors(e) };
  }
}

function createImageModule() {
  return new ImageModule({
    centered: false,
    getImage(tagValue: unknown) {
      if (tagValue instanceof ArrayBuffer) return tagValue;
      if (tagValue instanceof Uint8Array) return tagValue;
      return new ArrayBuffer(0);
    },
    getSize(_img: unknown, tagValue: unknown, _tagName: string): [number, number] {
      if (tagValue instanceof ArrayBuffer && tagValue.byteLength > 0) {
        const [w, h] = readImageSize(tagValue);
        return scaleToFit(w, h, 200);
      }
      return [120, 120];
    },
  });
}

function hasImagePlaceholders(zip: PizZip): boolean {
  return scanTemplateText(zip).some((text) => /\{\s*%[^{}]+?\s*\}/.test(text));
}

/** 把 docxtemplater 抛出的多错误结构整理为可读列表 */
function parseRenderErrors(e: unknown): RenderErrorDetail[] {
  const err = e as {
    message?: string;
    properties?: { errors?: unknown[]; explanation?: string };
  };
  const inner = err?.properties?.errors;
  if (Array.isArray(inner) && inner.length > 0) {
    return inner.map((sub) => {
      const s = sub as {
        message?: string;
        name?: string;
        properties?: { x?: string; id?: string; explanation?: string };
      };
      return {
        message: s.properties?.explanation ?? s.message ?? String(s),
        field: s.properties?.x ?? s.properties?.id,
      };
    });
  }
  return [{ message: err?.message ?? err?.properties?.explanation ?? String(e) }];
}

/** 从 ArrayBuffer 解析 PNG/JPEG 原始宽高；失败返回 [0,0] */
function readImageSize(buf: ArrayBuffer): [number, number] {
  const view = new DataView(buf);
  try {
    // PNG 签名 89 50 4E 47，IHDR 宽高在偏移 16/20
    if (buf.byteLength >= 24 && view.getUint32(0) === 0x89504e47) {
      return [view.getUint32(16), view.getUint32(20)];
    }
    // JPEG：FF D8 开头，扫描 SOF0(FFC0)/SOF2(FFC2) marker
    if (buf.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
      return readJpegSize(view);
    }
  } catch {
    // ignore
  }
  return [0, 0];
}

function readJpegSize(view: DataView): [number, number] {
  let offset = 2;
  const len = view.byteLength;
  while (offset < len - 1) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    // SOF0~SOF15（不含 SOF4/8/12）含尺寸信息
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return [width, height];
    }
    // 跳过当前 segment
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segLen = view.getUint16(offset + 2);
    offset += 2 + segLen;
  }
  return [0, 0];
}

/**
 * 预处理数据，防止 null.map() 类错误。
 * 扫描模板中的循环标签 {#xxx}，确保对应值为数组；
 * 其他 null/undefined 统一转为空字符串；
 * 非循环字段的对象/数组值提取为文本。
 */
function normalizeData(data: Record<string, unknown>, zip: PizZip): Record<string, unknown> {
  const loopFields = extractLoopFields(zip);
  const derivedData = deriveInvoiceData(data, loopFields);
  const safe: Record<string, unknown> = {};
  const keys = derivedData ? Object.keys(derivedData) : [];
  for (const key of keys) {
    const val = derivedData[key];
    if (val === null || val === undefined) {
      safe[key] = loopFields.has(key) ? [] : '';
    } else if (loopFields.has(key)) {
      safe[key] = normalizeLoopValue(val);
    } else if (val instanceof ArrayBuffer || val instanceof Uint8Array) {
      // 图片字段：保留二进制数据
      safe[key] = val;
    } else if (typeof val === 'object' || Array.isArray(val)) {
      // 对象/数组值：提取为文本（处理关联记录等）
      safe[key] = valueToText(val);
    } else {
      safe[key] = val;
    }
  }
  for (const field of loopFields) {
    if (!(field in safe)) {
      safe[field] = [];
    }
  }
  return safe;
}

function normalizeLoopValue(value: unknown): unknown[] {
  if (value === null || value === undefined || value === false) return [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object' || item instanceof ArrayBuffer || item instanceof Uint8Array) {
        return { value: valueToText(item) };
      }
      return normalizeRowObject(item as Record<string, unknown>);
    });
  }
  if (typeof value === 'object' && !(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) {
    return [normalizeRowObject(value as Record<string, unknown>)];
  }
  return value ? [{ value: valueToText(value) }] : [];
}

function normalizeRowObject(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[key] = '';
    } else if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
      result[key] = value;
    } else if (Array.isArray(value) || typeof value === 'object') {
      result[key] = valueToText(value);
    } else if (typeof value === 'number') {
      result[key] = formatNumberOrTimestamp(value);
    } else if (typeof value === 'boolean') {
      result[key] = value ? '是' : '否';
    } else {
      result[key] = value;
    }
  }
  return result;
}

function deriveInvoiceData(
  data: Record<string, unknown>,
  loopFields: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(data ?? {}) };
  let debitTotal = 0;
  let hasDebitTotal = false;

  for (const loopField of loopFields) {
    const debitName = stripPrefix(loopField, 'DEBIT_');
    const creditName = stripPrefix(loopField, 'CREDIT_');
    const amountField = debitName ?? creditName;
    if (!amountField) continue;

    const existingLoopValue = result[loopField];
    if (hasRenderableLoopValue(existingLoopValue)) continue;

    const directAmount = result[amountField];
    const nestedRows = collectRowsWithField(result, amountField);
    const rows = nestedRows.length > 0
      ? nestedRows
      : directAmount !== undefined
        ? [{ [amountField]: directAmount }]
        : [];

    result[loopField] = rows.filter((row) => valueToText(row[amountField]) !== '');

    for (const row of result[loopField] as Array<Record<string, unknown>>) {
      const numericAmount = readNumericAmount(row[amountField]);
      if (debitName && numericAmount !== null) {
        debitTotal += numericAmount;
        hasDebitTotal = true;
      }
      if (creditName && numericAmount !== null) {
        debitTotal -= numericAmount;
        hasDebitTotal = true;
      }
    }
  }

  if ((result['合计'] === null || result['合计'] === undefined || result['合计'] === '') && hasDebitTotal) {
    result['合计'] = Number.isInteger(debitTotal) ? String(debitTotal) : String(parseFloat(debitTotal.toFixed(2)));
  }

  return result;
}

function hasRenderableLoopValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function collectRowsWithField(
  data: Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
        rows.push(row);
      }
    }
  }
  return rows;
}

function stripPrefix(value: string, prefix: string): string | null {
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function readNumericAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readNumericAmount(item);
      if (parsed !== null) return parsed;
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['value', 'amount', 'text', 'name']) {
      const parsed = readNumericAmount(record[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * 动态包装模板功能已移除：合并改为同页数据扁平化方案。
 */

/** 从模板 XML 中提取所有循环字段名（{#xxx}），兼容 Word 把标签拆到多个 run 的情况。 */
function extractLoopFields(zip: PizZip): Set<string> {
  const fields = new Set<string>();
  for (const text of scanTemplateText(zip)) {
    let match: RegExpExecArray | null;
    const loopRegex = /\{\s*#\s*([^{}]+?)\s*\}/g;
    while ((match = loopRegex.exec(text)) !== null) {
      const name = match[1].trim();
      if (name) fields.add(name);
    }
  }
  return fields;
}

function scanTemplateText(zip: PizZip): string[] {
  const texts: string[] = [];
  for (const fileName of Object.keys(zip.files)) {
    if (!fileName.startsWith('word/') || !fileName.endsWith('.xml') || fileName.includes('_rels/')) continue;
    const file = zip.file(fileName);
    if (!file) continue;
    const xml = file.asText();
    const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [xml];
    for (const paragraph of paragraphs) {
      const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXml(match[1]))
        .join('');
      if (text) texts.push(text);
    }
  }
  return texts;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 等比缩放到 maxSize 以内，保持比例 */
function scaleToFit(w: number, h: number, maxSize: number): [number, number] {
  if (w <= 0 || h <= 0) return [maxSize, maxSize];
  if (w <= maxSize && h <= maxSize) return [w, h];
  const ratio = Math.min(maxSize / w, maxSize / h);
  return [Math.round(w * ratio), Math.round(h * ratio)];
}
