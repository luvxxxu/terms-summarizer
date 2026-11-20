import { PROVIDERS, loadSettings, resolveProvider, summarize } from './providers.js';

const $ = (id) => document.getElementById(id);
let settings;

const BUILTIN_ORIGINS = ['https://api.anthropic.com', 'https://api.openai.com', 'https://openrouter.ai'];

init();

async function init() {
  settings = await loadSettings();

  const active = $('activeProvider');
  for (const [id, def] of Object.entries(PROVIDERS)) {
    active.add(new Option(def.label, id));
  }
  active.value = settings.activeProvider;
  $('language').value = settings.language;
  $('maxChars').value = settings.maxChars;

  const box = $('providers');
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const cfg = settings.providers[id];
    const fs = document.createElement('fieldset');
    fs.innerHTML = `<legend>${def.label}</legend>`;
    if (id === 'custom') {
      fs.append(
        row('표시 이름', input(id, 'name', cfg.name, '예: 회사 LLM 게이트웨이')),
        row('API 주소', input(id, 'baseUrl', cfg.baseUrl, 'https://example.com/v1')),
        hint('엔드포인트 앞부분까지만 입력하세요. OpenAI 호환은 /chat/completions, Anthropic 호환은 /messages 가 뒤에 붙습니다. 예: http://localhost:11434/v1 (Ollama), http://localhost:1234/v1 (LM Studio)'),
        row('API 형식', formatSelect(cfg.format)),
      );
    }
    fs.append(
      row('API 키', input(id, 'apiKey', cfg.apiKey, def.keyHint, 'password')),
      row('모델', input(id, 'model', cfg.model, def.defaultModel || '모델 이름')),
    );
    if (id === 'anthropic') fs.append(hint('예: claude-haiku-5-5 (빠르고 저렴), claude-sonnet-5-5, claude-opus-5-5 (가장 정밀)'));
    if (id === 'openrouter') fs.append(hint('openrouter.ai/models 의 모델 ID를 입력하세요. 예: openai/gpt-5, google/gemini-2.5-pro'));
    box.appendChild(fs);
  }

  $('save').onclick = save;
  $('test').onclick = test;
}

function row(label, el) {
  const div = document.createElement('label');
  div.className = 'row';
  const span = document.createElement('span');
  span.textContent = label;
  div.append(span, el);
  return div;
}

function hint(text) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = text;
  return p;
}

function input(provider, field, value, placeholder, type = 'text') {
  const el = document.createElement('input');
  el.type = type;
  el.value = value || '';
  el.placeholder = placeholder || '';
  el.dataset.provider = provider;
  el.dataset.field = field;
  el.autocomplete = 'off';
  return el;
}

function formatSelect(value) {
  const sel = document.createElement('select');
  sel.dataset.provider = 'custom';
  sel.dataset.field = 'format';
  sel.add(new Option('OpenAI 호환 (Chat Completions)', 'openai'));
  sel.add(new Option('Anthropic 호환 (Messages)', 'anthropic'));
  sel.value = value || 'openai';
  return sel;
}

function collect() {
  settings.activeProvider = $('activeProvider').value;
  settings.language = $('language').value.trim() || '한국어';
  settings.maxChars = Math.max(1000, Number($('maxChars').value) || 150000);
  for (const el of document.querySelectorAll('[data-provider]')) {
    settings.providers[el.dataset.provider][el.dataset.field] = el.value.trim();
  }
}

/** 사용자 지정 주소라면 해당 호스트 접근 권한을 요청한다 (클릭 핸들러 안에서 호출해야 함). */
async function ensureCustomPermission() {
  const url = settings.providers.custom.baseUrl;
  if (!url) return true;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error('사용자 지정 API 주소가 올바른 URL이 아닙니다.');
  }
  if (BUILTIN_ORIGINS.includes(origin)) return true;
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

async function save() {
  collect();
  try {
    const granted = await ensureCustomPermission();
    await chrome.storage.local.set({ settings });
    setStatus(granted ? '저장되었습니다.' : '저장했지만, 사용자 지정 주소 접근 권한이 거부되어 호출이 실패할 수 있습니다.', !granted);
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function test() {
  collect();
  const p = resolveProvider(settings);
  setStatus(`${p.label} (${p.model}) 에 테스트 요청을 보내는 중…`);
  try {
    await ensureCustomPermission();
    await chrome.storage.local.set({ settings });
    const res = await summarize(settings, {
      title: '테스트 약관',
      url: 'about:test',
      text: '제1조 (목적) 본 약관은 회사가 제공하는 서비스의 이용 조건을 정합니다.\n제2조 (해지) 회원은 언제든지 해지할 수 있으나, 이미 결제한 금액은 환불되지 않습니다.',
    });
    setStatus(`✅ 연결 성공 (${res.model})`);
  } catch (e) {
    setStatus(`❌ ${e.message}`, true);
  }
}

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').className = isError ? 'err' : '';
}
