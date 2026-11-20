import { PROVIDERS, loadSettings, resolveProvider } from './providers.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
let tab;
let settings;

init();

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  settings = await loadSettings();
  fillProviders();

  $('openOptions').onclick = () => chrome.runtime.openOptionsPage();
  $('provider').onchange = async () => {
    settings.activeProvider = $('provider').value;
    await chrome.storage.local.set({ settings });
    showModel();
  };
  $('summarizePage').onclick = () => start(false);
  $('summarizeSelection').onclick = () => start(true);
  $('retry').onclick = () => start(false);
  $('cancel').onclick = () => chrome.runtime.sendMessage({ type: 'cancel', tabId: tab.id });
  $('copy').onclick = async () => {
    await navigator.clipboard.writeText(currentSummary);
    $('copy').textContent = '복사됨!';
    setTimeout(() => ($('copy').textContent = '복사'), 1200);
  };

  const key = `result:${tab.id}`;
  const stored = (await chrome.storage.session.get(key))[key];
  render(stored);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[key]) render(changes[key].newValue);
  });
}

function fillProviders() {
  const sel = $('provider');
  sel.innerHTML = '';
  for (const id of Object.keys(PROVIDERS)) {
    const p = resolveProvider(settings, id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
  sel.value = settings.activeProvider;
  showModel();
}

function showModel() {
  const p = resolveProvider(settings);
  const missing = [];
  if (!p.apiKey && p.id !== 'custom') missing.push('API 키');
  if (!p.baseUrl) missing.push('API 주소');
  if (!p.model) missing.push('모델');
  $('modelInfo').textContent = missing.length ? `⚠️ 설정 필요: ${missing.join(', ')}` : `모델: ${p.model}`;
}

function start(selectionOnly) {
  chrome.runtime.sendMessage({ type: 'summarize', tabId: tab.id, selectionOnly });
}

let currentSummary = '';

function render(state) {
  const status = state?.status || 'idle';
  // 다른 페이지로 이동했다면 이전 결과는 숨긴다
  const stale = state && state.url !== tab.url && status !== 'loading';
  const s = stale ? 'idle' : status;

  $('empty').hidden = s !== 'idle';
  $('loading').hidden = s !== 'loading';
  $('error').hidden = s !== 'error';
  $('result').hidden = s !== 'done';
  $('summarizePage').disabled = $('summarizeSelection').disabled = s === 'loading';

  if (s === 'loading') $('step').textContent = state.step || '요약하는 중…';
  if (s === 'error') $('error').textContent = state.error;
  if (s === 'done') {
    currentSummary = state.summary;
    $('summary').innerHTML = renderMarkdown(state.summary);
    $('warnings').innerHTML = '';
    for (const w of state.warnings || []) {
      const div = document.createElement('div');
      div.className = 'warning';
      div.textContent = w;
      $('warnings').appendChild(div);
    }
    const src = { selection: '선택 영역', main: '본문', page: '전체 페이지' }[state.source] || '';
    $('meta').textContent = `${state.provider} · ${state.model} · ${src} ${state.chars?.toLocaleString() || ''}자`;
  }
}
