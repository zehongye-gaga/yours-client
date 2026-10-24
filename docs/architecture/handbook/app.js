(() => {
  'use strict';
  const { content: C, scenarios, questions } = JSON.parse(document.getElementById('handbook-data').textContent);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const KEY = 'yours.microkernel.handbook.v1';
  const DOC_ID = 'yours-microkernel-handbook';
  const recordStates = { draft: '待决策', chosen: '已选择', verified: '已验证' };
  let storageAvailable = true;
  let loadWarning = '';
  let pendingImport = null;
  let decisionFilter = 'all';
  let currentMechanism = C.mechanisms[0].id;
  let currentScenario = scenarios[0].id;
  let currentBranch = scenarios[0].branches[0].id;
  let stepIndex = 0;
  let toastTimer;
  const emptyRecord = () => ({ choice: '', reason: '', evidence: '', status: 'draft', updatedAt: '' });
  const defaultState = () => ({ schemaVersion: 1, documentId: DOC_ID, decisions: {}, checks: [], theme: 'light' });

  function validatePayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.documentId !== DOC_ID || raw.schemaVersion !== 1) throw new Error('这不是本手册支持的 v1 记录文件。');
    const result = defaultState();
    if (!raw.decisions || typeof raw.decisions !== 'object' || Array.isArray(raw.decisions)) throw new Error('决策记录格式不正确。');
    for (const [id, record] of Object.entries(raw.decisions)) {
      const definition = C.decisions.find(item => item.id === id);
      if (!definition || !record || typeof record !== 'object' || Array.isArray(record)) throw new Error('文件包含未知的决策编号或无效记录。');
      const choice = record.choice ?? '';
      if (typeof choice !== 'string' || (choice && !definition.options.some(option => option.id === choice))) throw new Error(`${id} 的选项不属于当前手册。`);
      if (!Object.hasOwn(recordStates, record.status)) throw new Error(`${id} 的状态无效。`);
      for (const field of ['reason', 'evidence']) if (typeof record[field] !== 'string' || record[field].length > 4000) throw new Error(`${id} 的笔记必须是 4000 字以内的文本。`);
      if (record.status !== 'draft' && !choice) throw new Error(`${id} 尚未选择方案，无法标记为已选择或已验证。`);
      if (record.status === 'verified' && !record.evidence.trim()) throw new Error(`${id} 缺少验证证据。`);
      result.decisions[id] = { choice, reason: record.reason, evidence: record.evidence, status: record.status, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt.slice(0, 80) : '' };
    }
    if (!Array.isArray(raw.checks) || raw.checks.some(id => !C.checks.some(check => check.id === id))) throw new Error('验收清单包含未知条目。');
    result.checks = [...new Set(raw.checks)];
    result.theme = raw.theme === 'dark' ? 'dark' : 'light';
    return result;
  }

  let state = defaultState();
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) state = validatePayload(JSON.parse(stored));
    localStorage.setItem(KEY + '.probe', '1');
    localStorage.removeItem(KEY + '.probe');
  } catch (error) {
    storageAvailable = false;
    loadWarning = '本地记录未能读取或保存，当前改用内存；请导出备份。原记录未被覆盖。';
  }

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
  }

  function persist() {
    if (storageAvailable) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch { storageAvailable = false; toast('浏览器无法保存记录，请导出 JSON 备份。'); }
    }
    $('#storage-status').innerHTML = storageAvailable ? '笔记保存在当前浏览器<br>可随时导出备份' : '当前仅保存在内存<br>关闭前请导出 JSON';
  }

  function goLink(target, text, extra = '', className = 'text-link') {
    return `<a class="${className}" href="#${esc(target)}${extra ? '/' + esc(extra) : ''}">${esc(text)} <span aria-hidden="true">↗</span></a>`;
  }
  const sectionTitle = (title, eyebrow = '') => `<div class="section-title"><h2>${esc(title)}</h2>${eyebrow ? `<span>${esc(eyebrow)}</span>` : ''}</div>`;
  const codeBlock = (code, label) => `<div class="code-block"><div class="code-toolbar"><span>${esc(label)}</span><button class="copy-button" data-copy>复制</button></div><pre><code>${esc(code)}</code></pre></div>`;
  const bullets = values => `<ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
  const table = (heads, rows) => `<div class="table-wrap"><table><thead><tr>${heads.map(head => `<th scope="col">${esc(head)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const callout = (title, text, type = '') => `<div class="callout ${type}"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;

  function renderOverview() {
    return `<div class="overview-topline"><span class="eyebrow">YOURS CLIENT / ENGINEERING FIELD NOTES</span><span class="badge">设计草案 · v${esc(C.meta.version)}</span></div>
      <div class="hero"><div class="hero-copy"><p class="kicker">把架构问题，变成可验证的选择。</p><h1>微内核实现手册<span>基于 Cordis，组合产品能力。</span></h1><p>为 Yours Client 的实现过程准备。先明确职责，再理解机制，用时序与失败路径检验设计，最后把取舍留在决策记录里。</p><div class="hero-actions">${goLink('mechanisms', '开始阅读', '', 'button primary')}${goLink('scenarios', '演练一次生命周期')}</div></div>
      <div class="hero-art" aria-label="六个内核机制的概览"><div class="hero-art-header"><span>COMPOSABLE AGENT CLIENT</span><span class="status-dot"></span></div><div class="hero-kernel"><span>CORDIS · LOCAL FORK</span><strong>组合能力，管理生命周期</strong><small>让启动、变化与退出都有明确语义</small></div><div class="hero-modules">${['Scope', 'Registry', 'Lifecycle', 'Dependencies', 'Effects', 'Events'].map((item, i) => `<div class="hero-module"><span>0${i + 1}</span>${item}</div>`).join('')}</div><div class="hero-art-foot"><span>Agent</span><span>Node Runtime</span><span>Dynamic UI</span></div></div></div>
      <div class="metrics">${[[6, '机制与扩展主题'], [scenarios.length, '可逐步演练的场景'], [C.decisions.length, '待评审的决策'], [C.checks.length, '行为验收条目']].map(([n, label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('')}</div>
      ${sectionTitle('按你现在的问题开始', '三条阅读路径')}<div class="grid-3">${C.paths.map(path => `<a class="path-card" href="#${path.target}"><span class="path-number">${path.number}</span><h3>${esc(path.title)}</h3><p>${esc(path.text)}</p><div class="path-action"><span>${esc(path.action)}</span><span>↗</span></div></a>`).join('')}</div>
      ${sectionTitle('当前产品约束', '来自已记录的需求')}<div class="confirmed-list">${C.confirmed.map(([label, value]) => `<div class="confirmed-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
      <div class="status-legend"><span><i class="status-dot"></i>已确认：产品方向与约束</span><span><i class="status-dot blue"></i>设计基线：产品扩展的行为契约</span><span><i class="status-dot amber"></i>建议：仍需选择和验证的实现方式</span></div>
      ${callout('如何使用这份手册', 'Cordis core 与真实样例已经引入仓库；页面演练仍是产品协议的预设快照，不执行插件。原生 API 与待实现扩展分别标注。笔记保存在当前浏览器，移动文件前请导出 JSON。')}`;
  }

  function renderBoundaries() {
    return `<div class="grid-3">${C.layers.map(layer => `<article class="panel layer-card"><span class="badge">${esc(layer.tag)}</span><h2>${esc(layer.label)}</h2><p>${esc(layer.text)}</p>${bullets(layer.items)}</article>`).join('')}</div>
      <div class="map-banner"><div><span class="eyebrow">SYSTEM MAP</span><h3>一张图看清协作关系</h3><p>从工作台，经 Broker 与内核，到独立 Node 业务进程。图中关系表达职责协作，不表示所有对象位于同一进程。</p></div><button class="button primary" data-map>打开架构图 <span aria-hidden="true">↗</span></button></div>
      ${sectionTitle('产品需求 → 内核责任 → 验收证据', '划清实现边界')}${table(['产品需求', '微内核负责', '内核之外负责', '如何证明'], C.responsibilities.map(item => [item.need, item.kernel, item.outside, item.proof]))}
      ${sectionTitle('先区分这四种身份', '一个包 ≠ 一个进程 ≠ 一次运行')}<div class="identity-grid">${C.identities.map(item => `<div class="identity-card"><div class="identity-title"><strong>${esc(item.label)}</strong><code>${esc(item.name)}</code></div><div class="identity-example">${esc(item.example)}</div><p>${esc(item.text)}</p></div>`).join('')}</div>
      ${sectionTitle('可见性与资源归属分别建模')}<div class="scope-tree"><span>Root</span><b>→</b><span>Workspace A</span><b>→</b><span>Session 2</span></div><div class="grid-2"><article class="panel boundary-proof"><h3>Scope 解决：到哪里找服务</h3><p>产品管理 Workspace 的可见范围；Cordis 按明确服务键和 realm 隔离。是否共享父级能力由宿主显式实现。</p></article><article class="panel boundary-proof"><h3>Activation 解决：谁来释放资源</h3><p>插件 Fiber 管理受管资源；Context 派生不自动建立独立资源容器。产品 activationId 由宿主映射。</p></article></div>
      ${callout('当前选择：维护 Cordis 本地分支', '原样引入固定提交的 Cordis core，后续可以直接修改源码并补充测试。Workspace、进程、MCP、权限、存储、UI 和原子注册发布由产品服务补充。')}`;
  }

  function renderMechanisms() {
    return `<div class="mechanism-tabs" role="tablist" aria-label="六个核心机制">${C.mechanisms.map((item, index) => `<button class="mechanism-tab" role="tab" id="tab-${item.id}" data-mechanism="${item.id}" aria-controls="mechanism-detail" aria-selected="false"><span>0${index + 1} / ${esc(item.english)}</span><strong>${esc(item.name)}</strong></button>`).join('')}</div><div id="mechanism-detail" class="mechanism-detail" role="tabpanel"></div>`;
  }

  function updateMechanism(id) {
    const item = C.mechanisms.find(mechanism => mechanism.id === id) || C.mechanisms[0];
    currentMechanism = item.id;
    $$('[data-mechanism]').forEach(button => { const selected = button.dataset.mechanism === item.id; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    $('#mechanism-detail').setAttribute('aria-labelledby', `tab-${item.id}`);
    $('#mechanism-detail').innerHTML = `<span class="eyebrow">DESIGN BASELINE / ${esc(item.english)}</span><h2 class="lead">${esc(item.question)}</h2><p class="idea">${esc(item.idea)}</p><div class="structure-chips">${item.structures.map(structure => `<code class="structure-chip">${esc(structure)}</code>`).join('')}</div><div class="grid-2"><div><h3>实现顺序</h3><ol class="step-list">${item.steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${esc(step)}</p></li>`).join('')}</ol></div><div><div class="invariant-box"><span>必须成立的不变量</span><p>${esc(item.invariant)}</p></div>${callout('容易踩到的坑', item.trap, 'amber')}</div></div>${codeBlock(item.code, item.codeLabel || '概念伪代码 · 尚未实现')}<div class="mechanism-bottom"><div><span class="eyebrow">下一项需要决定</span><p>${esc(item.decide)}</p></div>${goLink('decisions', '记录 ' + item.decisionId, item.decisionId, 'button')}</div><div class="source-inline">${item.sources.length ? '参考：' + item.sources.map(url => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.split('/').pop())} ↗</a>`).join(' · ') : '来源标识：本产品的设计扩展，不是 Cordis 原生能力声明。'}</div>`;
  }

  function renderScenarios() {
    return `${callout('演练范围', '这里展示产品层的目标时序，waiting / draining 等为产品状态。Cordis 原生状态、事件与清理以本地源码和测试为准；注册批次和升级修订由待实现服务提供。')}<div class="scenario-picker" aria-label="选择演练场景">${scenarios.map((scenario, index) => `<button class="scenario-choice" data-scenario="${scenario.id}" aria-pressed="false">0${index + 1} · ${esc(scenario.title)}</button>`).join('')}</div><div class="simulation"><div class="sim-toolbar"><div><span class="badge">语义演示</span><span id="sim-subtitle"></span></div><label>演练分支 <select id="sim-branch" aria-label="演练分支"></select></label></div><div class="sim-stage" id="sim-stage" aria-live="polite"></div><div class="sim-controls"><button class="button" id="sim-prev">← 上一步</button><input type="range" id="sim-range" min="0" value="0" step="1" aria-label="演练步骤"><span class="sim-control-count" id="sim-count"></span><button class="button primary" id="sim-next">下一步 →</button><button class="button" id="sim-reset">重置</button></div></div><div class="section-title"><h2>本次演练的事件轨迹</h2><span>预设快照 · 不运行真实插件</span></div><div class="sim-log" id="sim-log"></div><div id="sim-lesson" class="sim-footnote"></div>`;
  }

  function updateScenario(id, branchId) {
    const scenario = scenarios.find(item => item.id === id) || scenarios[0];
    currentScenario = scenario.id;
    currentBranch = scenario.branches.some(branch => branch.id === branchId) ? branchId : scenario.branches[0].id;
    stepIndex = 0;
    $$('[data-scenario]').forEach(button => { const selected = button.dataset.scenario === scenario.id; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#sim-subtitle').textContent = scenario.subtitle;
    $('#sim-branch').innerHTML = scenario.branches.map(branch => `<option value="${branch.id}">${esc(branch.label)}</option>`).join('');
    $('#sim-branch').value = currentBranch;
    $('#sim-lesson').innerHTML = `<strong>推敲重点：</strong>${esc(scenario.lesson)} ${goLink('decisions', '关联决策 ' + scenario.decision, scenario.decision)}`;
    updateStep();
  }

  function updateStep() {
    const scenario = scenarios.find(item => item.id === currentScenario);
    const branch = scenario.branches.find(item => item.id === currentBranch);
    stepIndex = Math.max(0, Math.min(stepIndex, branch.steps.length - 1));
    const step = branch.steps[stepIndex];
    const list = values => values.length ? values.map(value => `<div>${esc(value)}</div>`).join('') : '<div class="muted">空</div>';
    $('#sim-stage').innerHTML = `<div class="sim-step-head"><div><span class="eyebrow">STEP ${String(stepIndex + 1).padStart(2, '0')}</span><h3>${esc(step.title)}</h3></div><span class="badge">可见修订 ${esc(step.revision)}</span></div><p class="sim-explanation">${esc(step.explanation)}</p><div class="state-nodes">${step.nodes.map(node => `<div class="state-node" data-state="${esc(node.state)}"><div><strong>${esc(node.name)}</strong><span class="badge" data-state="${esc(node.state)}">${esc(node.state)}</span></div><span class="generation">generation ${esc(node.generation)}</span><p>${esc(node.note || ' ')}</p></div>`).join('')}</div><div class="sim-registers"><div class="register-column visible-register"><h4>普通读者可见</h4>${list(step.visible)}</div><div class="register-column"><h4>暂存注册 · 尚不可见</h4>${list(step.staged)}</div><div class="register-column"><h4>仍持有的资源</h4>${list(step.resources)}</div></div><div class="sim-invariant"><span>不变量</span><span>${esc(step.invariant)}</span></div>`;
    $('#sim-range').max = String(branch.steps.length - 1);
    $('#sim-range').value = String(stepIndex);
    $('#sim-range').setAttribute('aria-valuetext', `${stepIndex + 1} / ${branch.steps.length}：${step.title}`);
    $('#sim-count').textContent = `${stepIndex + 1} / ${branch.steps.length}`;
    $('#sim-prev').disabled = stepIndex === 0;
    $('#sim-next').disabled = stepIndex === branch.steps.length - 1;
    $('#sim-log').innerHTML = branch.steps.slice(0, stepIndex + 1).map((item, index) => `<div class="${index === stepIndex ? 'current' : ''}"><span class="log-index">${String(index + 1).padStart(2, '0')}</span><span>${esc(item.log)}</span></div>`).join('');
    $('#sim-log').scrollTop = $('#sim-log').scrollHeight;
  }

  function renderInterfaces() {
    return `${callout('先定义契约，再决定部署位置', '下表是 Cordis 原生 API；下方 Tools / Views 与 RPC 为产品扩展示意。原生 Context 留在宿主进程，远程只传可序列化值和 handlerId。')}${sectionTitle('Cordis 原生 API', '对象插件使用 name / inject / apply')}${table(['概念接口', '返回 / 含义', '需要约定的行为'], C.interfaceRows)}
      ${sectionTitle('业务插件如何登记能力')}<div class="contract-grid">${codeBlock(C.pluginExample, 'Cordis 插件外形 · 产品服务为示意')}<div class="panel"><h3>稳定服务，动态贡献项</h3><p>Tools 与 Views 是服务；github.listPullRequests 与 github.dashboard 是贡献项。一个工具变化不应该无条件重启所有依赖 Tools 的插件。</p><p>SDK 在插件进程保留处理函数，分配 handlerId，再向宿主提交描述。Broker 调用时携带固定的目标 activationId，插件侧再查找本地 handler。</p><p>Tools / Views 的批次、提交和修订需要产品服务实现，再把撤销责任绑定到 Cordis effect；原生服务注册不自动参与跨注册表事务。</p>${goLink('decisions', '决定注册接入方式', 'D01')}</div></div>
      ${sectionTitle('一条跨进程调用如何完成')}<div class="flow-pills">${['Caller', '身份绑定', 'Policy', '目标 / 租约', 'Runtime', '结果'].map((item, index) => `${index ? '<i>→</i>' : ''}<span>${esc(item)}</span>`).join('')}</div><div class="contract-grid">${codeBlock(C.rpcExample, 'JSON-RPC 2.0 · 取消为本项目扩展')}<div class="panel"><h3>宿主必须完成的五步</h3><ol class="step-list">${C.rpcSteps.map((step, index) => `<li><span>0${index + 1}</span><p>${esc(step)}</p></li>`).join('')}</ol><p class="muted">建议定义可判别错误：UNAVAILABLE、UNAUTHORIZED、STALE_ACTIVATION、CANCELLED、DEADLINE_EXCEEDED。应用错误码与 JSON-RPC 标准错误码需分别映射。</p></div></div>
      ${sectionTitle('同一个协议，不同运行环境')}<div class="process-cards">${C.processFacts.map(([title, text]) => `<article class="process-card"><h4>${esc(title)}</h4><p>${esc(text)}</p></article>`).join('')}</div>
      ${callout('首版超时建议 · 待测量调整', '激活 30 秒、清理 5 秒作为可配置默认值。超时后撤销发布资格并报告未完成清理；独立进程可由 Supervisor 终止。同进程代码无法靠 Promise 超时强制结束，因此首版只加载可信代码。', 'amber')}
      <div class="source-inline">协议依据：<a target="_blank" rel="noopener noreferrer" href="https://www.jsonrpc.org/specification">JSON-RPC 2.0</a> · 宿主边界：<a target="_blank" rel="noopener noreferrer" href="https://www.electronjs.org/docs/latest/tutorial/security">Electron 安全指南</a> · 页面通信：<a target="_blank" rel="noopener noreferrer" href="https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage">postMessage</a></div>`;
  }

  function renderUpgrade() {
    return `${callout('热升级是跨层协议', 'Cordis 管理 Fiber 与受管资源；产品注册服务管理暂存批次和修订；部署服务协调切换，Broker 固定目标，Runtime 排空，数据服务交接写入。')}<div class="upgrade-track">${C.upgradeStages.map(stage => `<article class="upgrade-step"><span>${stage.code}</span><h3>${esc(stage.name)}</h3><p>${esc(stage.detail)}</p></article>`).join('')}</div>
      <div class="grid-2"><article class="panel comparison-panel"><span class="badge">切换前失败</span><h3>旧版本继续提供服务</h3><p>候选未发布，对外修订没有变化。撤销候选注册、清理候选资源，记录错误。</p><p>预热期间不允许候选对共享业务状态进行破坏性修改，否则“保留旧路由”不能还原数据。</p></article><article class="panel comparison-panel"><span class="badge amber">切换后失败</span><h3>先检查数据与调用兼容性</h3><p>回切旧代码需要旧运行环境仍可启动、数据兼容、写任务所有权可交回。已经执行的外部副作用不会因代码回切而撤销。</p><p>第一版采用向后兼容的数据格式；破坏性迁移另开设计与验收。</p></article></div>
      ${sectionTitle('旧 Step 要保留什么', 'Schema 与执行目标一起固定')}<div class="panel"><h3>模型尚未返回时，旧版本也不能提前释放</h3><p>Step S1 在 r7 取得工具定义，模型返回前系统已升级到 r8。S1 的工具调用仍需命中 r7 对应的旧 activation。仅统计“已经在执行的 RPC”不够，还要统计“持有快照、未来可能发起调用”的 Step 租约。</p><p>租约有期限；到期应报告该 Step 取消或失败，不能偷偷改用新工具。一个 Step 完成后，下一 Step 才获取新修订。</p>${goLink('scenarios', '逐步检查新旧版本交接', 'upgrade', 'button')}</div>
      ${sectionTitle('代码、配置、业务事实分别保存')}${table(['数据种类', '归属', '保存形态', '升级 / 重启行为'], C.dataRows)}
      ${sectionTitle('UI 变更也是一条协议')}<div class="grid-2"><div class="panel"><h3>先快照，再按序应用变化</h3><p>事件携带 activationId、viewId、revision 与 seq。页面只能在匹配修订上应用 Patch；发现缺序、换代或断线，就拉取完整 Snapshot 并重建游标。</p><p>注册提交只保证宿主注册表的完整性。远程页面采用“准备新视图 → 就绪 → 本地切换”，或明确展示加载态，不把网络传播当作分布式原子操作。</p></div><div class="panel"><h3>持续写入需要单独交接</h3><p>旧请求排空时，新版本可能已经开始读写。数据库约束、幂等键、任务租约和 fencing token 用于约束重复写入与后台任务接管。</p><p>首版允许短暂停写，优先把接管顺序说清楚；未定义写入交接前，不承诺业务状态无缝回滚。</p></div></div>`;
  }

  function renderDecisionCard(definition) {
    const record = state.decisions[definition.id] || emptyRecord();
    return `<details class="decision-card" id="decision-${definition.id}" data-decision="${definition.id}"><summary><span class="decision-id">${definition.id}</span><div class="decision-summary-title"><small>${esc(definition.group)}</small><h3>${esc(definition.title)}</h3></div><span class="badge record-badge" data-state="${record.status}">${recordStates[record.status]}</span></summary><div class="decision-body"><div class="decision-context"><div><h4>设计基线</h4><p>${esc(definition.baseline)}</p></div><div><h4>为什么要明确</h4><p>${esc(definition.why)}</p></div></div><fieldset class="options-fieldset"><legend class="sr-only">${definition.id} 选择实现方案</legend>${definition.options.map(option => `<label class="option-choice"><span class="option-head"><input type="radio" name="choice-${definition.id}" value="${option.id}" data-record-field="choice" ${record.choice === option.id ? 'checked' : ''}><span>${esc(option.label)}</span>${option.id === definition.recommended ? '<span class="recommended">建议起点</span>' : ''}</span><p>${esc(option.text)}</p><p>代价：${esc(option.tradeoff)}</p></label>`).join('')}</fieldset><div class="decision-proof"><p><strong>验证方式</strong> ${esc(definition.test)}</p><p><strong>重新评估的信号</strong> ${esc(definition.revisit)}</p></div><div class="decision-notes"><label><span class="field-label">我的选择理由<span>背景、约束与代价</span></span><textarea data-record-field="reason" maxlength="4000" placeholder="为什么这个方案适合当前阶段？">${esc(record.reason)}</textarea></label><label><span class="field-label">验证证据<span>测试结果、原型、PR 或测量</span></span><textarea data-record-field="evidence" maxlength="4000" placeholder="哪些实际证据支持这个选择？">${esc(record.evidence)}</textarea></label></div><div class="decision-foot"><label>记录状态<select data-record-field="status" aria-label="${definition.id} 记录状态">${Object.entries(recordStates).map(([id, label]) => `<option value="${id}" ${record.status === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><span class="decision-saved">${record.updatedAt ? '已载入记录' : '尚未填写 · 建议不等于已决策'}</span></div></div></details>`;
  }

  function renderDecisions() {
    return `<div class="decision-intro"><div><span class="eyebrow">ARCHITECTURE DECISION RECORDS</span><h2>把“为什么这样做”留下来。</h2><p>已改为复用可修改的 Cordis 本地分支。下面记录产品扩展的取舍；旧笔记保留，请按新边界复核。“已验证”需要选择与证据，正式决策仍需写入仓库。</p></div><div class="decision-stats"><div class="decision-stat"><strong id="chosen-count">0</strong><span>已有选择 / 12</span></div><div class="decision-stat"><strong id="verified-count">0</strong><span>标记已验证</span></div></div></div><div class="decision-toolbar"><div class="filter-pills" aria-label="筛选决策状态">${[['all', '全部'], ['draft', '待决策'], ['chosen', '已选择'], ['verified', '已验证']].map(([id, label]) => `<button class="filter-button ${id === 'all' ? 'active' : ''}" data-filter="${id}" aria-pressed="${id === 'all'}">${label}</button>`).join('')}</div><div class="toolbar-actions"><button class="button compact" data-export="markdown">导出 Markdown</button><button class="button compact" data-export="json">备份 JSON</button><button class="button compact" id="import-trigger">导入 JSON</button></div></div><div class="decision-list" id="decision-list">${C.decisions.map(renderDecisionCard).join('')}</div><p class="no-results" id="decision-empty" hidden>此状态下暂无记录。</p><p class="sim-footnote">JSON 可恢复笔记与验收勾选。Markdown 用于整理 ADR。移动本地 HTML 或切换浏览器时，浏览器可能使用不同的存储空间。</p>`;
  }

  function updateDecisionSummary() {
    const records = Object.values(state.decisions);
    const chosen = records.filter(record => record.choice).length;
    $('#chosen-count').textContent = String(chosen);
    $('#verified-count').textContent = String(records.filter(record => record.status === 'verified').length);
    $('#sidebar-count').textContent = `${chosen} / ${C.decisions.length}`;
    $('#sidebar-progress').style.width = `${chosen / C.decisions.length * 100}%`;
    let visible = 0;
    $$('.decision-card').forEach(card => {
      const record = state.decisions[card.dataset.decision] || emptyRecord();
      const badge = $('.record-badge', card);
      badge.textContent = recordStates[record.status];
      badge.dataset.state = record.status;
      $('[data-record-field="status"]', card).value = record.status;
      card.hidden = decisionFilter !== 'all' && record.status !== decisionFilter;
      if (!card.hidden) visible++;
    });
    $('#decision-empty').hidden = visible !== 0;
  }

  function editRecord(input) {
    const card = input.closest('[data-decision]');
    const id = card.dataset.decision;
    const record = { ...(state.decisions[id] || emptyRecord()) };
    const field = input.dataset.recordField;
    const value = input.value;
    if (field === 'status') {
      if (value !== 'draft' && !record.choice) { input.value = record.status; toast('请先选择一个方案。'); return; }
      if (value === 'verified' && !record.evidence.trim()) { input.value = record.status; toast('请先填写实际验证证据，再标记为已验证。'); return; }
    }
    if (field === 'choice' && value !== record.choice) record.status = 'chosen';
    record[field] = value;
    if (field === 'evidence' && record.status === 'verified') record.status = 'chosen';
    record.updatedAt = new Date().toISOString();
    state.decisions[id] = record;
    persist();
    $('.decision-saved', card).textContent = storageAvailable ? '已保存到当前浏览器' : '已暂存内存 · 请导出';
    updateDecisionSummary();
  }

  function renderRoadmap() {
    return `${callout('按行为推进实现', '先运行已引入的 Cordis 与测试，再补 Workspace、注册服务、进程和界面。下面的勾选是你的验收记录，不代表页面执行了测试。')}<div class="section-title"><h2>四步形成产品闭环</h2><span id="check-count" class="check-count"></span></div>${C.roadmap.map((phase, index) => `<section class="roadmap-phase"><div><span class="eyebrow">PHASE 0${index + 1} / ${esc(phase.label)}</span><h3>${esc(phase.title)}</h3><p>${esc(phase.deliver)}</p></div><ul class="checklist">${phase.checks.map(id => `<li><label><input type="checkbox" data-check="${id}" ${state.checks.includes(id) ? 'checked' : ''}><span>${esc(C.checks.find(check => check.id === id).text)}</span></label></li>`).join('')}</ul></section>`).join('')}
      ${sectionTitle('建议的最小包边界', '目录是建议，职责才是约束')}<div class="grid-3">${[['packages/protocol', 'Manifest、服务键、消息与错误的可序列化契约。避免依赖 Electron 或 Node 具体对象。'], ['vendor/cordis', '已有 core 与测试，可直接修改。原生机制由此复用；产品注册事务另建服务。'], ['packages/runtime-node', '启动进程、IPC、远程服务代理、就绪与终止。把系统能力留在这一层。']].map(([name, text]) => `<div class="panel package-card"><code>${esc(name)}</code><p>${esc(text)}</p></div>`).join('')}</div>
      ${callout('第一条可演示的产品链路', '用户要求 GitHub 工作台 → Agent 使用真实模型和插件工具 → Node Runtime 获取数据 → 面板出现并更新 → 插件升级后新增 PR 操作 → 客户端重启后恢复配置与数据。按钮必须调用受控工具，不能只展示一段静态 HTML。')}`;
  }

  function renderQuestions() {
    return `<div class="qa-controls"><label class="sr-only" for="faq-search">筛选实现问题</label><input class="inline-search" type="search" id="faq-search" placeholder="按问题或关键词筛选，例如：取消、依赖、RPC、回滚…"><span class="question-count" id="question-count"></span></div><div id="question-list">${questions.map((question, index) => `<details class="question-card" id="question-${index}" data-question="${index}"><summary>${esc(question.q)}</summary><div class="question-answer"><p>${esc(question.a)}</p><div class="question-tags">${question.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>${goLink(question.target, '查看相关原理', question.topic || question.decision || question.scenario || '', 'button compact')}</div></details>`).join('')}</div><p class="no-results" id="question-empty" hidden>没有匹配的问题。试试更短的关键词，或使用全局搜索。</p>`;
  }

  function renderSources() {
    return `${callout('源码参考固定在同一提交', `Cordis commit ${C.meta.commit}。本项目直接复用并维护本地 Cordis；原生 API 按源码执行。注册事务、发布修订、远程 Broker 和进程热替换是产品扩展。外链需要网络，手册本身可以离线使用。`)}<div class="source-grid">${C.sources.map((source, index) => `<article class="source-card"><span class="source-num">SOURCE ${String(index + 1).padStart(2, '0')}</span><h3>${esc(source.title)}</h3><code>${esc(source.file)}</code><p>${esc(source.purpose)}</p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">阅读原始资料 ↗</a><a class="source-related" href="#${source.chapter}${source.topic ? '/' + source.topic : ''}">对应章节 →</a></article>`).join('')}</div>
      ${sectionTitle('读 Cordis 时，带着这三个问题')}<div class="panel"><ol class="step-list"><li><span>01</span><p>代码在哪个时刻授予、检查、撤销一次激活的有效性？沿 _refresh → _reload → _unload 读，而不是只看 plugin() 入口。</p></li><li><span>02</span><p>服务变化如何找到受影响消费者？资源归属与依赖关系如何共同决定释放次序？外层 disposer 并行与局部 effects 逆序应分别理解。</p></li><li><span>03</span><p>公开方法的完成、取消与异常究竟表示什么？例如 Cordis emit 为同步分发，不能直接套用本手册建议的并行通知语义。</p></li></ol></div>
      ${sectionTitle('统一术语')}<dl class="glossary">${C.glossary.map(([term, meaning], index) => `<div class="glossary-item" id="term-${index}"><dt>${esc(term)}</dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl>
      ${sectionTitle('仓库中的原始文档', '这些链接依赖当前目录结构')}<div class="document-links"><a href="../product-requirements.md">产品需求 →</a><a href="microkernel-design.md">微内核设计 →</a><a href="cordis-design-questions.md">Cordis 设计问题 →</a><a href="microkernel-responsibilities.md">内核职责 →</a></div>`;
  }

  const renderers = { overview: renderOverview, boundaries: renderBoundaries, mechanisms: renderMechanisms, scenarios: renderScenarios, interfaces: renderInterfaces, upgrade: renderUpgrade, decisions: renderDecisions, roadmap: renderRoadmap, questions: renderQuestions, sources: renderSources };
  $('#chapter-nav').innerHTML = C.chapters.map(chapter => `<a class="nav-item" href="#${chapter.id}" data-nav="${chapter.id}"><span class="nav-number">${chapter.number}</span><span>${esc(chapter.title)}</span></a>`).join('');
  $('#chapters').innerHTML = C.chapters.map((chapter, index) => `<section class="chapter" id="chapter-${chapter.id}" hidden>${chapter.id !== 'overview' ? `<header class="chapter-header"><span class="eyebrow">CHAPTER ${chapter.number} / YOURS CLIENT</span><h1>${esc(chapter.title)}</h1><p>${esc(chapter.subtitle)}</p></header>` : ''}${renderers[chapter.id]()}<div class="chapter-next">${index > 0 ? goLink(C.chapters[index - 1].id, '← ' + C.chapters[index - 1].title) : '<span>按问题阅读，也可以顺序推进。</span>'}${index < C.chapters.length - 1 ? goLink(C.chapters[index + 1].id, '下一章 · ' + C.chapters[index + 1].title) : goLink('overview', '返回起点')}</div></section>`).join('');

  function setMenu(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sidebar-scrim').hidden = !open;
    $('#menu-toggle').setAttribute('aria-expanded', String(open));
    $('#menu-toggle').setAttribute('aria-label', open ? '关闭目录' : '打开目录');
  }

  function route() {
    let parts;
    try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { parts = []; }
    if (parts[0] === 'content') { $('#content').focus(); return; }
    const chapter = C.chapters.find(item => item.id === parts[0]) || C.chapters[0];
    $$('.chapter').forEach(section => section.hidden = section.id !== `chapter-${chapter.id}`);
    $$('[data-nav]').forEach(link => { const active = link.dataset.nav === chapter.id; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    $('#current-chapter').textContent = chapter.title;
    document.title = `${chapter.title} · Yours Client 微内核实现手册`;
    let target = null;
    if (chapter.id === 'mechanisms') updateMechanism(parts[1] || currentMechanism);
    if (chapter.id === 'scenarios' && parts[1] && parts[1] !== currentScenario) updateScenario(parts[1]);
    if (chapter.id === 'decisions' && C.decisions.some(item => item.id === parts[1])) {
      setDecisionFilter('all');
      target = $(`#decision-${parts[1]}`);
      target.open = true;
    }
    if (chapter.id === 'questions' && /^q\d+$/.test(parts[1] || '')) {
      $('#faq-search').value = '';
      filterQuestions();
      target = $(`#question-${Number(parts[1].slice(1))}`);
      if (target) target.open = true;
    }
    if (chapter.id === 'sources' && /^term-\d+$/.test(parts[1] || '')) target = document.getElementById(parts[1]);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }

  function navigate(target) {
    if (location.hash === '#' + target) route();
    else location.hash = target;
  }

  function setDecisionFilter(value) {
    decisionFilter = value;
    $$('[data-filter]').forEach(button => { button.classList.toggle('active', button.dataset.filter === value); button.setAttribute('aria-pressed', String(button.dataset.filter === value)); });
    updateDecisionSummary();
  }

  function filterQuestions() {
    const query = $('#faq-search').value.trim().toLowerCase();
    let count = 0;
    $$('[data-question]').forEach(card => {
      const question = questions[Number(card.dataset.question)];
      card.hidden = ![question.q, question.a, ...question.tags].join(' ').toLowerCase().includes(query);
      if (!card.hidden) count++;
    });
    $('#question-count').textContent = `${count} / ${questions.length}`;
    $('#question-empty').hidden = count !== 0;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    $('#theme-toggle').setAttribute('aria-label', state.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题');
    const frameDocument = $('#map-frame').contentDocument;
    if (frameDocument?.documentElement && $('#map-frame').dataset.loaded) frameDocument.documentElement.dataset.theme = state.theme;
  }

  function download(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function markdownExport() {
    const quote = text => text.split('\n').map(line => '> ' + line).join('\n');
    const lines = ['# Yours Client 微内核架构决策记录', '', `导出时间：${new Date().toISOString()}`, '', '这是个人工作记录，不代表项目已批准的决策；“已验证”为作者标记，非手册自动测试。', ''];
    C.decisions.forEach(definition => {
      const record = state.decisions[definition.id] || emptyRecord();
      const option = definition.options.find(item => item.id === record.choice);
      lines.push(`## ${definition.id} ${definition.title}`, '', `状态：${recordStates[record.status]}`, '', `设计基线：${definition.baseline}`, '', `当前选择：${option ? option.label : '尚未选择'}`, '', `选择的代价：${option ? option.tradeoff : '待记录'}`, '', '选择理由：', '', quote(record.reason || '待填写'), '', '验证证据：', '', quote(record.evidence || '待填写'), '', `建议验证：${definition.test}`, '', `重新评估信号：${definition.revisit}`, '');
    });
    lines.push('## 行为验收清单', '');
    C.checks.forEach(check => lines.push(`- [${state.checks.includes(check.id) ? 'x' : ' '}] ${check.text}`));
    lines.push('', '## 参考范围', '', `Cordis 固定提交：${C.meta.commit}`, '', '注册批次、修订切换、远程 Broker 与进程热替换是 Yours Client 的扩展设计。', '');
    return lines.join('\n');
  }

  function exportRecords(format) {
    const day = new Date().toISOString().slice(0, 10);
    if (format === 'json') download(`yours-kernel-notes-${day}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json;charset=utf-8');
    else download(`yours-kernel-decisions-${day}.md`, markdownExport(), 'text/markdown;charset=utf-8');
    toast(format === 'json' ? '已导出 JSON，可用于恢复记录。' : '已导出 Markdown 决策记录。');
  }

  const searchIndex = [
    ...C.chapters.map(item => ({ title: item.title, text: item.subtitle, kind: '章节', target: item.id })),
    ...C.mechanisms.map(item => ({ title: item.name + ' · ' + item.question, text: item.idea, kind: '核心机制', target: 'mechanisms/' + item.id })),
    ...questions.map((item, index) => ({ title: item.q, text: item.a + ' ' + item.tags.join(' '), kind: '实现问题', target: 'questions/q' + index })),
    ...C.decisions.map(item => ({ title: item.id + ' · ' + item.title, text: item.why + ' ' + item.baseline, kind: '架构决策', target: 'decisions/' + item.id })),
    ...C.glossary.map(([title, text], index) => ({ title, text, kind: '术语', target: 'sources/term-' + index }))
  ];

  function search() {
    const query = $('#global-search').value.trim().toLowerCase();
    const matches = searchIndex.map(item => ({ ...item, score: !query ? 1 : (item.title.toLowerCase().includes(query) ? 3 : 0) + (item.text.toLowerCase().includes(query) ? 1 : 0) })).filter(item => item.score).sort((a, b) => b.score - a.score).slice(0, 18);
    $('#search-results').innerHTML = matches.length ? matches.map(item => `<button class="search-result" data-search-target="${item.target}"><span class="search-kind">${item.kind}</span><strong>${esc(item.title)}</strong><p>${esc(item.text.slice(0, 100))}${item.text.length > 100 ? '…' : ''}</p></button>`).join('') : '<div class="no-results">没有匹配结果，试试更短的关键词。</div>';
  }

  function openSearch() {
    $('#global-search').value = '';
    search();
    $('#search-dialog').showModal();
    $('#global-search').focus();
  }

  async function copyCode(button) {
    const value = $('code', button.closest('.code-block')).textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('fallback');
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      button.focus();
      if (!copied) { toast('浏览器禁止复制，请在代码区手动选择文本。'); return; }
    }
    toast('代码已复制；这是概念示例。');
  }

  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close]');
    if (close) $('#' + close.dataset.close).close();
    const mechanism = event.target.closest('[data-mechanism]');
    if (mechanism) { updateMechanism(mechanism.dataset.mechanism); history.replaceState(null, '', '#mechanisms/' + currentMechanism); }
    const scenario = event.target.closest('[data-scenario]');
    if (scenario) { updateScenario(scenario.dataset.scenario); history.replaceState(null, '', '#scenarios/' + currentScenario); }
    const filter = event.target.closest('[data-filter]');
    if (filter) setDecisionFilter(filter.dataset.filter);
    const exporter = event.target.closest('[data-export]');
    if (exporter) exportRecords(exporter.dataset.export);
    const result = event.target.closest('[data-search-target]');
    if (result) { $('#search-dialog').close(); navigate(result.dataset.searchTarget); }
    const copier = event.target.closest('[data-copy]');
    if (copier) copyCode(copier);
    if (event.target.closest('[data-map]')) {
      if (!$('#map-frame').dataset.loaded) {
        $('#map-frame').srcdoc = JSON.parse($('#diagram-data').textContent);
        $('#map-frame').dataset.loaded = 'true';
      }
      $('#map-dialog').showModal();
    }
  });

  document.addEventListener('input', event => {
    if (event.target.matches('textarea[data-record-field]')) editRecord(event.target);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('input[data-record-field],select[data-record-field]')) editRecord(event.target);
    if (event.target.matches('[data-check]')) {
      const checks = new Set(state.checks);
      if (event.target.checked) checks.add(event.target.dataset.check); else checks.delete(event.target.dataset.check);
      state.checks = [...checks];
      persist();
      $('#check-count').textContent = `${state.checks.length} / ${C.checks.length} 已勾选`;
    }
  });
  $('#sim-branch').addEventListener('change', event => updateScenario(currentScenario, event.target.value));
  $('#sim-prev').addEventListener('click', () => { stepIndex--; updateStep(); });
  $('#sim-next').addEventListener('click', () => { stepIndex++; updateStep(); });
  $('#sim-reset').addEventListener('click', () => { stepIndex = 0; updateStep(); });
  $('#sim-range').addEventListener('input', event => { stepIndex = Number(event.target.value); updateStep(); });
  $('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); persist(); });
  $('#menu-toggle').addEventListener('click', () => setMenu(!$('#sidebar').classList.contains('open')));
  $('#sidebar-scrim').addEventListener('click', () => setMenu(false));
  $('#search-trigger').addEventListener('click', openSearch);
  $('#global-search').addEventListener('input', search);
  $('#faq-search').addEventListener('input', filterQuestions);
  $('#top-export').addEventListener('click', () => exportRecords('markdown'));
  $('#download-map').addEventListener('click', () => download('yours-kernel-map.html', JSON.parse($('#diagram-data').textContent), 'text/html;charset=utf-8'));
  $('#import-trigger').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('导入文件超过 256 KB，请选择本手册导出的记录。');
      pendingImport = validatePayload(JSON.parse(await file.text()));
      $('#import-summary').textContent = `将合并 ${Object.keys(pendingImport.decisions).length} 项决策记录，并补充 ${pendingImport.checks.length} 项已勾选验收。已有验收勾选保留；页面主题保持当前设置。`;
      $('#import-dialog').showModal();
    } catch (error) { pendingImport = null; toast(error instanceof SyntaxError ? 'JSON 无法解析，现有记录未修改。' : error.message); }
  });
  $('#confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    state.decisions = { ...state.decisions, ...pendingImport.decisions };
    state.checks = [...new Set([...state.checks, ...pendingImport.checks])];
    pendingImport = null;
    persist();
    $('#decision-list').innerHTML = C.decisions.map(renderDecisionCard).join('');
    $$('[data-check]').forEach(input => input.checked = state.checks.includes(input.dataset.check));
    $('#check-count').textContent = `${state.checks.length} / ${C.checks.length} 已勾选`;
    updateDecisionSummary();
    $('#import-dialog').close();
    toast('记录已合并，项目文档未修改。');
  });

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!$('#search-dialog').open) openSearch(); return; }
    if (event.key === 'Escape') setMenu(false);
    if ($('#search-dialog').open && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      const results = $$('.search-result');
      const index = results.indexOf(document.activeElement);
      if (event.key === 'Enter' && document.activeElement === $('#global-search')) { event.preventDefault(); results[0]?.click(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); results[Math.min(index + 1, results.length - 1)]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); if (index <= 0) $('#global-search').focus(); else results[index - 1]?.focus(); }
    }
    if (event.target.matches('[data-mechanism]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const index = C.mechanisms.findIndex(item => item.id === currentMechanism);
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + C.mechanisms.length) % C.mechanisms.length;
      const button = $(`[data-mechanism="${C.mechanisms[next].id}"]`);
      button.click(); button.focus();
    }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (window.innerWidth > 700) setMenu(false); });
  updateMechanism(currentMechanism);
  updateScenario(currentScenario);
  updateDecisionSummary();
  filterQuestions();
  $('#check-count').textContent = `${state.checks.length} / ${C.checks.length} 已勾选`;
  applyTheme();
  $('#storage-status').innerHTML = storageAvailable ? '笔记保存在当前浏览器<br>可随时导出备份' : '当前仅保存在内存<br>关闭前请导出 JSON';
  route();
  if (loadWarning) toast(loadWarning);
})();
