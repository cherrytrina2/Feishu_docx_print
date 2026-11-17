import { FieldType } from '@lark-base-open/js-sdk';
import dayjs from 'dayjs';

/** Values passed to the document renderer. Keep booleans and numbers typed. */
export type NormalizedValue =
  | string
  | number
  | boolean
  | null
  | NormalizedValue[]
  | Record<string, unknown>;

export function normalizeFieldValue(type: FieldType, value: unknown): NormalizedValue {
  if (value === null || value === undefined) return null;

  switch (type) {
    case FieldType.Text:
      return textValue(value);
    case FieldType.Number:
    case FieldType.Currency:
    case FieldType.Progress:
    case FieldType.Rating: {
      const number = Number(value);
      return Number.isFinite(number) ? number : textValue(value);
    }
    case FieldType.DateTime:
    case FieldType.CreatedTime:
    case FieldType.ModifiedTime:
      return timestampValue(value);
    case FieldType.Checkbox:
      return value === true;
    case FieldType.SingleSelect:
      return optionText(value);
    case FieldType.MultiSelect:
      return optionList(value).join('、');
    case FieldType.User:
    case FieldType.CreatedUser:
    case FieldType.ModifiedUser:
      return userList(value).join('、');
    case FieldType.Phone:
    case FieldType.Email:
    case FieldType.AutoNumber:
      return textValue(value);
    case FieldType.Url:
      return linkText(value);
    case FieldType.SingleLink:
    case FieldType.DuplexLink:
      return linkText(value);
    case FieldType.Location:
      return locationText(value);
    case FieldType.GroupChat:
      return optionText(value);
    default:
      return normalizeUnknown(value);
  }
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return String(value ?? '');
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return String(record.text ?? record.name ?? record.content ?? '');
    }
    return '';
  }).join('');
}

function optionText(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.text ?? record.name ?? '');
  }
  return String(value ?? '');
}

function optionList(value: unknown): string[] {
  if (!Array.isArray(value)) return optionText(value) ? [optionText(value)] : [];
  return value.map(optionText).filter(Boolean);
}

function userList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return '';
    return String((item as Record<string, unknown>).name ?? '');
  }).filter(Boolean);
}

function timestampValue(value: unknown): string {
  const date = dayjs(Number(value));
  if (!date.isValid()) return '';
  return date.hour() === 0 && date.minute() === 0
    ? date.format('YYYY-MM-DD')
    : date.format('YYYY-MM-DD HH:mm');
}

function linkText(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return String(record.text ?? '');
  }
  if (Array.isArray(value)) return value.map(linkText).filter(Boolean).join('、');
  return String(value ?? '');
}

function locationText(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '');
  const record = value as Record<string, unknown>;
  return String(record.name ?? record.address ?? record.full_name ?? '');
}

function normalizeUnknown(value: unknown): NormalizedValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeUnknown);
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return '';
}
