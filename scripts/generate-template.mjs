import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = resolve(__dirname, '../public/templates/运费形式发票_v2.docx');
const outDir = resolve(__dirname, '../public-runtime/templates');
const outFile = resolve(outDir, 'default-invoice.docx');

mkdirSync(outDir, { recursive: true });

if (!existsSync(sourceFile)) {
  throw new Error(`找不到默认模板源文件: ${sourceFile}`);
}

copyFileSync(sourceFile, outFile);
console.log(`默认模板已同步: ${outFile}`);
