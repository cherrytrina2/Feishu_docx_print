import type { TemplateValidation } from '../core/templateInspector';
import { scanTemplateTags, validateTemplate } from '../core/templateInspector';

export interface TemplateAuditReport extends TemplateValidation {
  matchedCount: number;
}

export function buildTemplateAudit(
  templateBuffer: ArrayBuffer,
  availableFields: string[],
  mappings: Record<string, string> = {},
): TemplateAuditReport {
  const tags = scanTemplateTags(templateBuffer);
  const validation = validateTemplate(tags, availableFields, mappings);
  return {
    ...validation,
    matchedCount: validation.tags.length - validation.missing.length,
  };
}
