import { loadSettings, resolveProvider, summarize } from './providers.js';

// 탭별 결과는 chrome.storage.session 의 "result:<tabId>" 키에 저장한다.
// 팝업이 닫혀도 요청은 서비스 워커에서 계속 진행된다.
const running = new Map(); // tabId -> AbortController

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'summarize-selection',
    title: '선택한 텍스트를 약관으로 요약',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'summarize-page',
    title: '이 페이지 약관 요약',
    contexts: ['page'],
  });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const selection = info.menuItemId === 'summarize-selection' ? info.selectionText : undefined;
  // 팝업을 열어 진행 상황을 보여준다 (지원되지 않는 환경이면 무시)
  chrome.action.openPopup?.().catch(() => {});
  startSummary(tab, { selection });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'summarize') {
    chrome.tabs.get(msg.tabId).then((tab) => startSummary(tab, { selectionOnly: msg.selectionOnly }));
    sendResponse({ ok: true });
  } else if (msg?.type === 'cancel') {
    running.get(msg.tabId)?.abort();
    sendResponse({ ok: true });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  running.get(tabId)?.abort();
  chrome.storage.session.remove(`result:${tabId}`);
});

async function setState(tabId, state) {
  await chrome.storage.session.set({ [`result:${tabId}`]: { ...state, updatedAt: Date.now() } });
}

async function startSummary(tab, { selection, selectionOnly } = {}) {
  const tabId = tab.id;
  running.get(tabId)?.abort();
  const controller = new AbortController();
  running.set(tabId, controller);

  const base = { url: tab.url, title: tab.title };
  await setState(tabId, { ...base, status: 'loading', step: '페이지에서 텍스트를 추출하는 중…' });

  try {
    const settings = await loadSettings();
    const provider = resolveProvider(settings);

    let doc;
    if (selection) {
      doc = { title: tab.title, url: tab.url, text: selection, source: 'selection' };
    } else {
      doc = await extractFromTab(tabId);
      if (selectionOnly && doc.source !== 'selection') {
        throw new Error('선택된 텍스트가 없습니다. 페이지에서 약관 부분을 드래그한 뒤 다시 시도하세요.');
      }
    }
    doc.text = (doc.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (doc.text.length < 50) throw new Error('요약할 텍스트를 찾지 못했습니다. 약관 본문을 드래그해서 선택한 뒤 다시 시도하세요.');

    const maxChars = Number(settings.maxChars) || 150000;
    const originalLength = doc.text.length;
    doc.truncated = originalLength > maxChars;
    if (doc.truncated) doc.text = doc.text.slice(0, maxChars);

    await setState(tabId, {
      ...base,
      status: 'loading',
      step: `${provider.label} (${provider.model})로 요약하는 중… (${originalLength.toLocaleString()}자)`,
    });

    const result = await summarize(settings, doc, { signal: controller.signal });
    const warnings = [];
    if (doc.truncated) {
      warnings.push(`문서가 길어서 앞 ${maxChars.toLocaleString()}자만 분석했습니다 (전체 ${originalLength.toLocaleString()}자). 설정에서 최대 길이를 늘리거나, 필요한 부분만 선택해서 요약하세요.`);
    }
    if (result.warning) warnings.push(result.warning);

    await setState(tabId, {
      ...base,
      status: 'done',
      summary: result.text,
      provider: provider.label,
      model: result.model,
      source: doc.source,
      chars: originalLength,
      warnings,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      await setState(tabId, { ...base, status: 'idle' });
    } else {
      await setState(tabId, { ...base, status: 'error', error: e.message || String(e) });
    }
  } finally {
    if (running.get(tabId) === controller) running.delete(tabId);
  }
}

async function extractFromTab(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageText });
  } catch (e) {
    throw new Error('이 페이지에서는 텍스트를 읽을 수 없습니다 (chrome:// 페이지, 웹 스토어, PDF 뷰어 등). 텍스트를 복사해 다른 페이지에 붙여넣거나 우클릭 메뉴를 이용하세요.');
  }
  return results?.[0]?.result || { text: '' };
}

// 페이지 안에서 실행되는 함수 (외부 변수 참조 금지)
function extractPageText() {
  const sel = String(window.getSelection?.() || '').trim();
  if (sel.length >= 200) {
    return { title: document.title, url: location.href, text: sel, source: 'selection' };
  }

  const bodyLen = (document.body?.innerText || '').length;
  const candidates = document.querySelectorAll(
    'main, article, [role="main"], #content, #main, .content, .terms, .policy, .privacy, .legal, [class*="terms"], [class*="policy"], [class*="agreement"], [id*="terms"], [id*="policy"]',
  );
  let best = null;
  let bestLen = 0;
  for (const el of candidates) {
    const len = (el.innerText || '').length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  // 본문 후보가 페이지 텍스트의 대부분을 담고 있으면 그것만 사용 (메뉴·푸터 제거)
  const useBest = best && bestLen > 500 && bestLen > bodyLen * 0.4;
  const text = useBest ? best.innerText : document.body?.innerText || '';
  return { title: document.title, url: location.href, text, source: useBest ? 'main' : 'page' };
}
