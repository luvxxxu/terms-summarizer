// 아주 작은 Markdown → HTML 변환기. 모든 텍스트를 먼저 이스케이프하므로 LLM 응답에 HTML이 섞여도 안전하다.

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\s)&gt;\s?(.+)$/, '$1<q>$2</q>'); // 목록 안의 "> 인용"
}

const RISK = { 낮음: 'low', 보통: 'mid', 높음: 'high', low: 'low', medium: 'mid', high: 'high' };

export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara();
      closeList();
      const level = Math.min(m[1].length + 1, 4);
      let content = inline(m[2]);
      const risk = m[2].match(/(?:위험도|Risk)[^:：]*[:：]\s*\**\s*(낮음|보통|높음|low|medium|high)/i);
      if (risk) {
        const cls = RISK[risk[1].toLowerCase()] || RISK[risk[1]];
        content = content.replace(escapeHtml(risk[1]), `<span class="risk risk-${cls}">${escapeHtml(risk[1])}</span>`);
      }
      out.push(`<h${level}>${content}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      const type = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (list !== type) {
        closeList();
        out.push(`<${type}>`);
        list = type;
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara();
      closeList();
      out.push('<hr>');
    } else {
      if (list) {
        // 목록 항목의 이어지는 줄
        out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, `<br>${inline(line.trim())}</li>`);
      } else {
        para.push(line);
      }
    }
  }
  flushPara();
  closeList();
  return out.join('\n');
}
