import { readFileSync, writeFileSync } from 'node:fs';

const DIST_HTML = 'dist/index.html';
const html = readFileSync(DIST_HTML, 'utf-8');
const version = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const updated = html.replace(/%PLUGIN_VERSION%/g, version);
writeFileSync(DIST_HTML, updated, 'utf-8');
console.log(`[version] 注入构建版本号: ${version} → ${DIST_HTML}`);