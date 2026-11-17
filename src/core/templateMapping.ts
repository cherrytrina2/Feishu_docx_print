export type TemplateData = Record<string, unknown>;

/** Map stable template names to actual field names without changing the Word file. */
export function applyTemplateMapping(data: TemplateData, mappings: Record<string, string>): TemplateData {
  const result: TemplateData = { ...data };
  for (const [templateName, fieldPath] of Object.entries(mappings)) {
    const value = readPath(data, fieldPath);
    if (value !== undefined) result[templateName] = value;
  }
  return result;
}

function readPath(data: TemplateData, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, data);
}
