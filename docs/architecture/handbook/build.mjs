import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { content } from './content.mjs';
import { scenarios, questions } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [template, css, app, diagram] = await Promise.all([
  readFile(resolve(here, 'template.html'), 'utf8'),
  readFile(resolve(here, 'styles.css'), 'utf8'),
  readFile(resolve(here, 'app.js'), 'utf8'),
  readFile(resolve(here, '../diagrams/kernel-map.html'), 'utf8'),
]);
const jsonForHTML = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const replacements = {
  __HANDBOOK_CSS__: css,
  __HANDBOOK_DATA__: jsonForHTML({ content, scenarios, questions }),
  __DIAGRAM_DATA__: jsonForHTML(diagram),
  __HANDBOOK_APP__: app,
};
let html = template;
for (const [token, value] of Object.entries(replacements)) {
  if (!html.includes(token)) throw new Error(`Missing template token: ${token}`);
  html = html.replace(token, () => value);
}
const output = resolve(here, '../implementation-handbook.html');
await writeFile(output, html);
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), chapters: content.chapters.length, mechanisms: content.mechanisms.length, scenarios: scenarios.length, questions: questions.length, decisions: content.decisions.length, checks: content.checks.length }, null, 2));
