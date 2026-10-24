// Browser checks for this interactive document; no packages or local server required.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { content } from './content.mjs';
import { scenarios } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const artifact = resolve(here, '../implementation-handbook.html');
const output = resolve(here, 'qa');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'yours-handbook-'));
const downloads = resolve(profile, 'downloads');
await mkdir(downloads);
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-networking', '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let sequence = 0;
let incoming = '';
const pending = new Map();
const errors = [];
const requests = [];
const responses = [];
const blocked = [];
const results = [];
let session;
let stderr = '';
chrome.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
chrome.stdio[4].on('data', data => {
  incoming += data.toString();
  let end;
  while ((end = incoming.indexOf('\0')) !== -1) {
    const message = JSON.parse(incoming.slice(0, end));
    incoming = incoming.slice(end + 1);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Network.requestWillBeSent') requests.push({id:message.params.requestId,url:message.params.request.url});
    else if (message.method === 'Network.responseReceived') responses.push(message.params.response.url);
    else if (message.method === 'Network.loadingFailed') blocked.push({id:message.params.requestId,reason:message.params.blockedReason || message.params.errorText});
  }
});
chrome.on('error', error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); });
function send(method, params = {}, sessionId = session) {
  return new Promise((resolvePromise, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}; ${stderr}`)); }, 15000);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
const delay = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 50; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Condition timeout: ' + expression);
}
function check(name, condition, details) {
  results.push({ name, passed: !!condition, ...(details === undefined ? {} : { details }) });
  if (!condition) throw new Error('Check failed: ' + name + ' ' + JSON.stringify(details));
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function input(selector, value, event = 'input') {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true})); })()`);
}
async function route(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await until(`!document.getElementById(${JSON.stringify('chapter-' + hash.split('/')[0])}).hidden`);
  await delay(50);
}
async function viewport(width, height) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await delay(120); }
async function screenshot(name, full = false) {
  if (full) await evaluate(`(() => { document.activeElement?.blur(); scrollTo({top:0,behavior:'instant'}); })()`);
  await delay(200);
  let clip;
  if (full) {
    const metrics = await send('Page.getLayoutMetrics');
    clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(metrics.cssContentSize.height, 2400), scale: 1 };
  }
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  await writeFile(resolve(output, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function importFile(path) {
  const document = await send('DOM.getDocument');
  const element = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#import-file' });
  await send('DOM.setFileInputFiles', { nodeId: element.nodeId, files: [path] });
  await delay(150);
}
let failure;
try {
  const target = await send('Target.createTarget', { url: 'about:blank' }, null);
  session = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }, null);
  await viewport(1440, 1000);
  await send('Page.navigate', { url: pathToFileURL(artifact).href });
  await until(`document.querySelectorAll('.chapter').length === 10 && !document.querySelector('#chapter-overview').hidden`);
  check('10 chapters rendered without script errors', errors.length === 0, errors);
  check('browser is offline during verification', await evaluate('navigator.onLine === false'));
  await screenshot('overview-light-1440');
  await click('#theme-toggle');
  await screenshot('overview-dark-1440');
  check('theme changes', await evaluate(`document.documentElement.dataset.theme === 'dark'`));
  await click('#theme-toggle');

  const containments = [];
  for (const [width, height] of [[1440,900], [1600,1000], [1920,1080], [760,1024], [390,844]]) {
    await viewport(width, height);
    for (const chapter of content.chapters) {
      await route(chapter.id);
      const measured = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visible:[...document.querySelectorAll('.chapter')].filter(el=>!el.hidden).length})`);
      containments.push({ chapter: chapter.id, width, ...measured });
      check(`containment ${width}px / ${chapter.id}`, measured.scrollWidth <= width && measured.visible === 1, measured);
    }
  }
  await route('overview');
  await screenshot('overview-mobile-390', true);
  await click('#menu-toggle');
  check('mobile menu opens', await evaluate(`document.querySelector('#sidebar').classList.contains('open') && !document.querySelector('#sidebar-scrim').hidden`));
  await click('[data-nav="scenarios"]');
  await until(`!document.querySelector('#chapter-scenarios').hidden`);
  check('mobile navigation closes menu', await evaluate(`!document.querySelector('#sidebar').classList.contains('open')`));
  await screenshot('scenario-mobile-390', true);
  await viewport(1440,1000);

  await route('mechanisms');
  for (const mechanism of content.mechanisms) {
    await click(`[data-mechanism="${mechanism.id}"]`);
    check(`mechanism ${mechanism.id}`, await evaluate(`document.querySelector('#mechanism-detail').textContent.includes(${JSON.stringify(mechanism.question)}) && document.querySelectorAll('[role=tab][aria-selected=true]').length === 1`));
  }
  await click('[data-mechanism="lifecycle"]');
  await screenshot('mechanisms-light', true);

  await route('scenarios');
  let frames = 0;
  for (const scenario of scenarios) {
    await click(`[data-scenario="${scenario.id}"]`);
    for (const branch of scenario.branches) {
      await input('#sim-branch', branch.id, 'change');
      for (const [index, step] of branch.steps.entries()) {
        if (index) await click('#sim-next');
        const observed = await evaluate(`({text:document.querySelector('#sim-stage').textContent,count:document.querySelector('#sim-count').textContent,logs:document.querySelector('#sim-log').children.length})`);
        check(`${scenario.id}/${branch.id} frame ${index + 1}`, observed.text.includes(step.title) && observed.text.includes(step.revision) && observed.logs === index + 1, { count: observed.count });
        frames++;
      }
      check(`${scenario.id}/${branch.id} stops at last step`, await evaluate(`document.querySelector('#sim-next').disabled`));
      await click('#sim-reset');
      check(`${scenario.id}/${branch.id} reset`, await evaluate(`document.querySelector('#sim-prev').disabled && document.querySelector('#sim-range').value === '0'`));
    }
  }
  await click('[data-scenario="upgrade"]');
  await input('#sim-branch', 'success', 'change');
  await input('#sim-range', '3');
  await screenshot('upgrade-simulation', true);

  await route('decisions/D01');
  await input('#decision-D01 select', 'verified', 'change');
  check('cannot verify without choice', await evaluate(`document.querySelector('#decision-D01 select').value === 'draft'`));
  await click('#decision-D01 input[value="owned"]');
  await input('#decision-D01 select', 'verified', 'change');
  check('cannot verify without evidence', await evaluate(`document.querySelector('#decision-D01 select').value === 'chosen'`));
  await input('#decision-D01 textarea[data-record-field="reason"]', 'QA：统一注册归属，失败时不留下半成品。');
  await input('#decision-D01 textarea[data-record-field="evidence"]', 'QA：准备失败的场景测试通过；这是手册交互测试笔记。');
  await input('#decision-D01 select', 'verified', 'change');
  check('verification requires and accepts evidence', await evaluate(`document.querySelector('#decision-D01 .record-badge').textContent === '已验证'`));
  await route('roadmap');
  await click('[data-check="batch-atomic"]');
  await click('#theme-toggle');
  await send('Page.reload');
  await until(`document.querySelectorAll('.chapter').length === 10`);
  check('record, checklist, and theme persist across reload', await evaluate(`document.documentElement.dataset.theme === 'dark' && document.querySelector('#decision-D01 select').value === 'verified' && document.querySelector('[data-check="batch-atomic"]').checked && document.querySelector('#decision-D01 textarea[data-record-field="reason"]').value.includes('QA：')`));
  await click('#theme-toggle');
  await route('decisions/D01');
  await screenshot('decision-workbench', true);
  await input('#decision-D01 textarea[data-record-field="evidence"]', 'QA：修改证据后需要重新确认。');
  check('changed evidence requires reverification', await evaluate(`document.querySelector('#decision-D01 select').value === 'chosen'`));
  await input('#decision-D01 select', 'verified', 'change');
  await click('[data-filter="draft"]');
  check('decision filter', await evaluate(`document.querySelector('#decision-D01').hidden && [...document.querySelectorAll('.decision-card')].filter(el=>!el.hidden).length === 11`));
  await click('[data-filter="all"]');

  await click('[data-export="json"]');
  await click('[data-export="markdown"]');
  let files = [];
  for (let attempt = 0; attempt < 30; attempt++) { files = await readdir(downloads); if (files.some(file=>file.endsWith('.json')) && files.some(file=>file.endsWith('.md'))) break; await delay(100); }
  const exportedJSON = JSON.parse(await readFile(resolve(downloads, files.find(file=>file.endsWith('.json'))), 'utf8'));
  const exportedMD = await readFile(resolve(downloads, files.find(file=>file.endsWith('.md'))), 'utf8');
  check('JSON export preserves records and checks', exportedJSON.decisions.D01.status === 'verified' && exportedJSON.checks.includes('batch-atomic'));
  check('Markdown exports all decisions and checklist', exportedMD.includes('## D12 ') && exportedMD.includes('- [x] 部分准备失败') && exportedMD.includes('QA：统一注册归属'));

  const badFile = resolve(profile, 'invalid.json');
  await writeFile(badFile, JSON.stringify({ schemaVersion:1,documentId:'wrong-document',decisions:{},checks:[] }));
  await importFile(badFile);
  check('invalid import changes nothing', await evaluate(`!document.querySelector('#import-dialog').open && document.querySelector('#decision-D01 select').value === 'verified'`));
  const imported = { schemaVersion:1, documentId:'yours-microkernel-handbook', decisions: { D02: { choice:'explicit', reason:'<img src=x onerror="window.__noteExecuted=true"> & 中文', evidence:'', status:'chosen', updatedAt:'2026-10-24T00:00:00Z' } }, checks:['scope-lookup'] };
  const goodFile = resolve(profile, 'import.json');
  await writeFile(goodFile, JSON.stringify(imported));
  await importFile(goodFile);
  check('valid import asks for merge before changing records', await evaluate(`document.querySelector('#import-dialog').open && !document.querySelector('#decision-D02 input:checked')`));
  await click('#confirm-import');
  check('import merges, preserves existing records, escapes notes', await evaluate(`document.querySelector('#decision-D01 select').value === 'verified' && document.querySelector('#decision-D02 input:checked').value === 'explicit' && document.querySelector('#decision-D02 textarea').value.startsWith('<img') && !document.querySelector('#decision-D02 img') && !window.__noteExecuted && document.querySelector('[data-check="scope-lookup"]').checked && document.querySelector('[data-check="batch-atomic"]').checked`));

  await route('questions');
  await input('#faq-search', '取消');
  check('FAQ search filters content', await evaluate(`document.querySelectorAll('.question-card:not([hidden])').length > 0 && document.querySelectorAll('.question-card:not([hidden])').length < 28`));
  await click('#search-trigger');
  await input('#global-search', 'D07');
  check('global search finds decisions', await evaluate(`document.querySelector('.search-result').textContent.includes('D07')`));
  await click('.search-result');
  await until(`!document.querySelector('#chapter-decisions').hidden`);
  check('search navigates and opens result', await evaluate(`document.querySelector('#decision-D07').open && !document.querySelector('#search-dialog').open`));

  await route('boundaries');
  await click('[data-map]');
  await until(`document.querySelector('#map-frame').contentDocument?.querySelector('svg')`);
  check('embedded offline diagram renders', await evaluate(`document.querySelector('#map-dialog').open && document.querySelector('#map-frame').contentDocument.body.textContent.includes('微内核')`));
  await screenshot('architecture-modal');
  await click('[data-close="map-dialog"]');

  await evaluate(`localStorage.removeItem('yours.microkernel.handbook.v1')`);
  await route('overview');
  await send('Page.reload');
  await until(`document.querySelectorAll('.chapter').length === 10 && !document.querySelector('#chapter-overview').hidden && document.querySelector('#sidebar-count').textContent === '0 / 12'`);
  await viewport(1920,1080);
  await screenshot('overview-light-1920');
  check('no runtime exceptions', errors.length === 0, errors);
  const externalAttempts = requests.filter(item=>/^https?:/.test(item.url)).map(item=>({...item,blocked:blocked.find(failure=>failure.id===item.id)?.reason}));
  check('no external resource fetched; optional diagram font is blocked', responses.every(url=>!/^https?:/.test(url)) && externalAttempts.every(item=>item.blocked === 'csp'), externalAttempts);
  await rm(resolve(output, 'failure.png'), { force:true });
  console.log(JSON.stringify({ status:'passed', checks:results.length, scenarioFrames:frames, screenshots:await readdir(output).then(names=>names.filter(name=>name.endsWith('.png'))), containments:containments.length }, null, 2));
} catch (error) {
  failure = error;
  console.error(error.stack);
  try { await screenshot('failure'); } catch {}
} finally {
  const html = await readFile(artifact);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify({ status:failure?'failed':'passed', artifact: { path:'../../implementation-handbook.html', sha256:createHash('sha256').update(html).digest('hex'), bytes:html.length }, checkedAt:new Date().toISOString(), checks:results, runtimeErrors:errors, failure:failure?.message || null, visualReview:'pending' }, null, 2));
  try { await send('Browser.close', {}, null); } catch {}
  await delay(500);
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await rm(profile, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
}
if (failure) process.exitCode = 1;
