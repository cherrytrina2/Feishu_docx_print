import PizZip from 'pizzip';

export type TemplateTagKind = 'text' | 'image' | 'section' | 'inverted';

export interface TemplateTag {
  name: string;
  kind: TemplateTagKind;
  raw: string;
}

export interface TemplateValidation {
  tags: TemplateTag[];
  missing: string[];
  mapped: Record<string, string>;
}

/** Scan text placeholders in document paragraphs, including tags split across Word runs. */
export function scanTemplateTags(templateBuffer: ArrayBuffer): TemplateTag[] {
  const zip = new PizZip(templateBuffer);
  const tags: TemplateTag[] = [];
  const seen = new Set<string>();
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
      for (const match of text.matchAll(/\{\s*([#%^]?)([^{}]+?)\s*\}/g)) {
        const prefix = match[1];
        const name = match[2].trim();
        if (name.startsWith('/')) continue;
        if (!name) continue;
        const kind: TemplateTagKind = prefix === '%' ? 'image' : prefix === '#' ? 'section' : prefix === '^' ? 'inverted' : 'text';
        const key = `${kind}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push({ name, kind, raw: match[0] });
      }
    }
  }
  return tags;
}

export function validateTemplate(
  tags: TemplateTag[],
  availableFields: string[],
  mappings: Record<string, string> = {},
): TemplateValidation {
  const available = new Set(availableFields);
  const mapped: Record<string, string> = {};
  const missing: string[] = [];
  for (const tag of tags) {
    const target = mappings[tag.name] || (available.has(tag.name) ? tag.name : '');
    if (target) mapped[tag.name] = target;
    else if (!missing.includes(tag.name)) missing.push(tag.name);
  }
  return { tags, missing, mapped };
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
