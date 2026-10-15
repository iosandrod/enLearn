const api = window.desktopPrint.api;
const state = { printers: [], config: null, jobs: [], logFile: '' };
const titles = {
  overview: ['运行状态', '监控打印服务与最近任务'], printers: ['打印机配置', '设置默认设备、纸张和打印偏移'],
  jobs: ['任务记录', '查看打印结果并手动重试失败任务'], settings: ['客户端设置', '管理开机启动、记录与更新']
};

document.querySelectorAll('.nav').forEach((button) => button.addEventListener('click', () => openPage(button.dataset.page)));
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#test-print').addEventListener('click', testPrint);
document.querySelector('#save-profile').addEventListener('click', saveProfile);
document.querySelector('#save-settings').addEventListener('click', saveSettings);
document.querySelector('#check-update').addEventListener('click', checkUpdate);
document.querySelector('#profile-printer').addEventListener('change', fillProfile);
document.addEventListener('click', async (event) => {
  const defaultButton = event.target.closest('[data-default-printer]');
  if (defaultButton) await setDefault(defaultButton.dataset.defaultPrinter);
  const retryButton = event.target.closest('[data-retry]');
  if (retryButton) await retry(retryButton.dataset.retry);
});

async function refresh() {
  setBusy('#refresh', true);
  try {
    const [printers, config, jobs] = await Promise.all([api('/printers'), api('/config'), api('/jobs?limit=200')]);
    state.printers = printers.printers; state.config = config.config; state.jobs = jobs.jobs; state.logFile = config.logFile;
    render();
  } catch (error) { toast(error.message, true); }
  finally { setBusy('#refresh', false); }
}

function render() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector('#printer-count').textContent = state.printers.length;
  document.querySelector('#queue-count').textContent = state.jobs.filter((job) => job.status === 'queued' || job.status === 'printing').length;
  document.querySelector('#today-success').textContent = state.jobs.filter((job) => job.createdAt.startsWith(today) && job.status === 'submitted').length;
  document.querySelector('#today-failed').textContent = state.jobs.filter((job) => job.createdAt.startsWith(today) && job.status === 'failed').length;
  const options = state.printers.map((printer) => `<option value="${escapeAttr(printer.name)}">${escapeHtml(printer.displayName || printer.name)}</option>`).join('');
  ['#quick-printer', '#profile-printer'].forEach((selector) => { const element = document.querySelector(selector); const previous = element.value; element.innerHTML = options; element.value = previous || state.config.defaultPrinter || state.printers[0]?.name || ''; });
  document.querySelector('#printer-list').innerHTML = state.printers.length ? state.printers.map((printer) => `<div class="printer-item"><div><strong>${escapeHtml(printer.displayName || printer.name)}</strong><small>${escapeHtml(printer.name)}${printer.isDefault ? ' · Windows 默认' : ''}</small></div><div class="printer-actions">${printer.name === state.config.defaultPrinter ? '<span class="status submitted">客户端默认</span>' : `<button class="secondary" data-default-printer="${escapeAttr(printer.name)}">设为默认</button>`}</div></div>`).join('') : '<p>没有检测到系统打印机。</p>';
  document.querySelector('#recent-jobs').innerHTML = jobTable(state.jobs.slice(0, 8));
  document.querySelector('#job-list').innerHTML = jobTable(state.jobs);
  document.querySelector('#auto-start').checked = state.config.autoStart;
  document.querySelector('#update-url').value = state.config.updateFeedUrl || '';
  document.querySelector('#max-history').value = state.config.maxHistory;
  document.querySelector('#log-file').textContent = state.logFile;
  fillProfile();
}

function fillProfile() {
  if (!state.config) return;
  const printer = document.querySelector('#profile-printer').value;
  const profile = state.config.printerProfiles[printer] || state.config.defaultProfile;
  setValue('#paper-width', profile.paper.widthMm); setValue('#paper-height', profile.paper.heightMm);
  setValue('#offset-x', profile.offset.xMm); setValue('#offset-y', profile.offset.yMm);
  setValue('#margin-top', profile.paper.marginMm.top); setValue('#margin-right', profile.paper.marginMm.right);
  setValue('#margin-bottom', profile.paper.marginMm.bottom); setValue('#margin-left', profile.paper.marginMm.left);
  setValue('#landscape', String(profile.landscape)); document.querySelector('#print-background').checked = profile.printBackground;
}

async function setDefault(name) {
  try { await api('/printers/default', { method: 'PUT', body: { name } }); toast('已设置系统和客户端默认打印机。'); await refresh(); }
  catch (error) { toast(error.message, true); }
}

async function testPrint() {
  setBusy('#test-print', true);
  try {
    const result = await api('/test-print', { method: 'POST', body: {
      printerName: value('#quick-printer'), copies: numberValue('#quick-copies'),
      page: { widthMm: numberValue('#quick-width'), heightMm: numberValue('#quick-height'), marginMm: { top: 0, right: 0, bottom: 0, left: 0 } }
    } });
    toast(result.ok ? '测试页已提交系统打印队列。' : '测试打印失败。', !result.ok); await refresh();
  } catch (error) { toast(error.message, true); }
  finally { setBusy('#test-print', false); }
}

async function saveProfile() {
  const printer = value('#profile-printer');
  if (!printer) return toast('请先选择打印机。', true);
  const profile = {
    paper: { widthMm: numberValue('#paper-width'), heightMm: numberValue('#paper-height'), marginMm: { top: numberValue('#margin-top'), right: numberValue('#margin-right'), bottom: numberValue('#margin-bottom'), left: numberValue('#margin-left') } },
    offset: { xMm: numberValue('#offset-x'), yMm: numberValue('#offset-y') },
    landscape: value('#landscape') === 'true', printBackground: document.querySelector('#print-background').checked
  };
  try { const result = await api('/config', { method: 'PUT', body: { printerProfiles: { ...state.config.printerProfiles, [printer]: profile } } }); state.config = result.config; toast('打印机参数已保存。'); }
  catch (error) { toast(error.message, true); }
}

async function saveSettings() {
  try { const result = await api('/config', { method: 'PUT', body: { autoStart: document.querySelector('#auto-start').checked, updateFeedUrl: value('#update-url'), maxHistory: numberValue('#max-history') } }); state.config = result.config; toast('客户端设置已保存。'); }
  catch (error) { toast(error.message, true); }
}

async function checkUpdate() {
  setBusy('#check-update', true);
  try { const result = await api('/updates/check', { method: 'POST', body: {} }); toast(result.result?.message || '已开始检查更新。'); }
  catch (error) { toast(error.message, true); }
  finally { setBusy('#check-update', false); }
}

async function retry(id) {
  try { const result = await api(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', body: {} }); toast(result.ok ? '重试任务已提交系统打印队列。' : '重试失败。', !result.ok); await refresh(); }
  catch (error) { toast(error.message, true); await refresh(); }
}

function jobTable(jobs) {
  if (!jobs.length) return '<p>暂无打印任务。</p>';
  return `<table><thead><tr><th>时间</th><th>任务 / 模板</th><th>打印机</th><th>份数</th><th>结果</th><th>操作</th></tr></thead><tbody>${jobs.map((job) => `<tr><td>${formatTime(job.createdAt)}</td><td>${escapeHtml(job.jobName)}<br><small>${escapeHtml(job.templateName)}</small></td><td>${escapeHtml(job.printerName)}</td><td>${job.copies}</td><td class="${job.status === 'failed' ? 'error' : ''}"><span class="status ${job.status}">${statusName(job.status)}</span>${job.error ? `<br><small>${escapeHtml(job.error)}</small>` : ''}</td><td>${job.status === 'failed' ? `<button class="retry" data-retry="${job.id}">重试</button>` : '—'}</td></tr>`).join('')}</tbody></table>`;
}
function openPage(name) { document.querySelectorAll('.nav,.page').forEach((item) => item.classList.remove('active')); document.querySelector(`.nav[data-page="${name}"]`).classList.add('active'); document.querySelector(`#${name}`).classList.add('active'); document.querySelector('#page-title').textContent = titles[name][0]; document.querySelector('#page-subtitle').textContent = titles[name][1]; }
function statusName(status) { return ({ queued: '等待中', printing: '打印中', submitted: '已提交', failed: '失败' })[status] || status; }
function formatTime(value) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
function value(selector) { return document.querySelector(selector).value; }
function numberValue(selector) { return Number(value(selector)); }
function setValue(selector, data) { document.querySelector(selector).value = data; }
function setBusy(selector, busy) { const element = document.querySelector(selector); element.disabled = busy; }
function toast(message, error = false) { const element = document.querySelector('#toast'); element.textContent = message; element.className = `show${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.className = ''; }, 3500); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function escapeAttr(value) { return escapeHtml(value); }

void refresh();
