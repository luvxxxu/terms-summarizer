# 약관 요약기 (Terms Summarizer) – 크롬 확장 프로그램

이용약관이나 개인정보처리방침 페이지를 LLM으로 요약하고, 사용자에게 불리한 조항을 짚어 줍니다.

## 지원하는 제공자
| 제공자 | API 형식 | 기본 모델 |
|---|---|---|
| Claude (Anthropic) | Messages API | `claude-haiku-5-5` |
| ChatGPT (OpenAI) | Chat Completions | `gpt-5` |
| OpenRouter | OpenAI 호환 | `anthropic/claude-opus-4.5` |
| 사용자 지정 | OpenAI 호환 / Anthropic 호환 중 선택 | 직접 입력 |

사용자 지정에는 Ollama(`http://localhost:11434/v1`), LM Studio(`http://localhost:1234/v1`), vLLM, LiteLLM, 사내 게이트웨이처럼 OpenAI 또는 Anthropic 형식을 따르는 모든 엔드포인트를 쓸 수 있습니다. 저장하면 그 주소에 접근할 권한을 요청합니다.

## 설치
1. `chrome://extensions` 열기 → 오른쪽 위 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더 선택
3. 설정 페이지가 열리면 API 키와 모델을 입력하고 **연결 테스트**

## 사용법
- 약관 페이지에서 확장 아이콘 → **이 페이지 약관 요약**
- 일부만 요약하려면: 텍스트를 드래그한 뒤 **선택 영역만** 또는 우클릭 → *선택한 텍스트를 약관으로 요약*
- 팝업을 닫아도 요약은 백그라운드에서 계속 진행되고, 다시 열면 결과가 보입니다 (탭별로 저장).

## 결과 형식
한 줄 요약 · 위험도(낮음/보통/높음) · 핵심 내용 · ⚠️ 주의할 조항(원문 인용) · 개인정보 · 결제/해지/환불 · 책임 제한/분쟁 해결

## 파일 구성
- `manifest.json` – MV3 매니페스트
- `providers.js` – 제공자 정의, 프롬프트, API 호출 (Anthropic / OpenAI 호환)
- `background.js` – 페이지 텍스트 추출, 요약 실행, 우클릭 메뉴
- `popup.*` – 팝업 UI, `options.*` – 설정 페이지, `markdown.js` – 결과 렌더링(HTML 이스케이프)

## 참고
- API 키는 `chrome.storage.local`에만 저장되며, 선택한 제공자에게만 전송됩니다.
- Claude는 브라우저에서 직접 호출하기 위해 `anthropic-dangerous-direct-browser-access` 헤더를 사용합니다. 공식 API에서 Opus 5.5·Sonnet 5.5 등으로 바꿔 쓸 때는 모델이 거절하면 서버가 다른 모델로 자동 재시도하도록(`fallbacks: "default"`) 설정되어 있습니다.
- 문서가 설정한 최대 길이(기본 150,000자)보다 길면 앞부분만 보내고, 팝업에 그 사실을 표시합니다.
- 기본 모델은 빠르고 저렴한 `claude-haiku-5-5`입니다. 더 정밀한 분석이 필요하면 `claude-sonnet-5-5`나 `claude-opus-5-5`로 바꾸세요.
- `chrome://` 페이지, 크롬 웹 스토어, 내장 PDF 뷰어에서는 페이지 텍스트를 읽을 수 없습니다. 이럴 땐 텍스트를 선택한 뒤 우클릭 메뉴를 쓰세요.
