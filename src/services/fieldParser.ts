import { FieldType } from '@lark-base-open/js-sdk';
import dayjs from 'dayjs';

/**
 * 把多维表格单元格的原始值（IOpenCellValue）按字段类型解析为纯字符串。
 * 用于 docxtemplater 文本占位符替换与 UI 展示。
 */
export function parseFieldValue(type: FieldType, value: unknown): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case FieldType.Text:
      return parseTextSegments(value);

    case FieldType.Number:
    case FieldType.Currency:
    case FieldType.Progress:
    case FieldType.Rating:
      return formatNumber(value);

    case FieldType.SingleSelect:
      return pickText(value);

    case FieldType.MultiSelect:
      return pickTextList(value).join('、');

    case FieldType.DateTime:
    case FieldType.CreatedTime:
    case FieldType.ModifiedTime:
      return formatTimestamp(value);

    case FieldType.Checkbox:
      return value ? '是' : '否';

    case FieldType.User:
    case FieldType.CreatedUser:
    case FieldType.ModifiedUser:
      return pickUserNames(value).join('、');

    case FieldType.Phone:
    case FieldType.Email:
      return typeof value === 'string' ? value : pickText(value);

    case FieldType.Url:
      return parseUrl(value);

    case FieldType.AutoNumber:
      return String(value ?? '');

    case FieldType.SingleLink:
    case FieldType.DuplexLink:
      return parseLinkRecord(value);

    case FieldType.Location:
      return parseLocation(value);

    case FieldType.GroupChat:
      return pickText(value);

    default:
      // Formula / Lookup / Barcode 等多态字段，尽力取 text
      return tryStringify(value);
  }
}

/** 多行文本：IOpenSegment[] → 纯文本 */
function parseTextSegments(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return tryStringify(value);
  return value
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      if (seg && typeof seg === 'object') {
        const s = seg as Record<string, unknown>;
        return (s.text as string) ?? (s.name as string) ?? (s.content as string) ?? '';
      }
      return '';
    })
    .join('');
}

function formatNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  // 保留合理精度，去掉多余小数位
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(4)));
}

function formatTimestamp(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = dayjs(n);
  if (!d.isValid()) return '';
  // 00:00 视为纯日期，不带时间
  const hasTime = d.hour() !== 0 || d.minute() !== 0;
  return hasTime ? d.format('YYYY-MM-DD HH:mm') : d.format('YYYY-MM-DD');
}

function pickText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickTextList(value).join('、');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return (o.text as string) ?? (o.name as string) ?? '';
  }
  return String(value);
}

function pickTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return pickText(value) ? [pickText(value)] : [];
  if (value.length === 0) return [];
  return value
    .map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return (o.text as string) ?? (o.name as string) ?? '';
      }
      return '';
    })
    .filter(Boolean);
}

function pickUserNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];
  return value
    .map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return (o.name as string) ?? '';
      }
      return '';
    })
    .filter(Boolean);
}

function parseUrl(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') {
          const o = v as Record<string, unknown>;
          return (o.text as string) ?? (o.link as string) ?? '';
        }
        return String(v ?? '');
      })
      .filter(Boolean)
      .join('、');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return (o.text as string) ?? (o.link as string) ?? '';
  }
  return String(value ?? '');
}

function parseLinkRecord(value: unknown): string {
  if (!Array.isArray(value)) return pickText(value);
  if (value.length === 0) return '';
  return value
    .map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return (o.text as string) ?? '';
      }
      return '';
    })
    .filter(Boolean)
    .join('、');
}

function parseLocation(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return (o.name as string) ?? (o.address as string) ?? (o.full_name as string) ?? '';
  }
  return String(value ?? '');
}

function tryStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
