# Vast.ai + Ollama + LiteLLM 세팅 가이드

> 외부 앱(RAG 앱 / Continue 등)에서 Vast.ai 인스턴스의 Ollama 모델을 **API 키 인증으로** 사용하기 위한 전체 설정 기록.
> 다음에 인스턴스를 새로 만들거나, AI에게 상황을 설명할 때 이 문서를 그대로 붙여넣으면 됨.

---

## 0. 전체 구조 (한눈에)

```
[외부 앱 / Continue]
        │  https://<터널주소>/v1  (키: sk-redsky-1234)
        ▼
[Cloudflare 터널]  ──►  [LiteLLM 프록시 :4000]   ← 키 인증을 여기서 담당
                                  │  http://localhost:21434 (인증 없음)
                                  ▼
                            [Ollama 본체 :21434]  ← 실제 모델 서빙
```

핵심 아이디어: **Ollama 본체(내부 21434)는 인증이 없으므로, 그 앞에 LiteLLM 프록시를 세워 깨끗한 OpenAI 호환 `/v1` + 내 키를 제공한다.** 이러면 Vast.ai가 외부 포트에 걸어둔 Caddy 인증벽을 우회할 수 있다.

---

## 1. 이 인스턴스 환경의 중요한 사실들

- **GPU**: 2x RTX 3090 (총 VRAM 48GB = 24GB × 2)
- **템플릿**: `vastai/openwebui` (OpenWebUI + Jupyter + Ollama 묶음)
- **추론 엔진**: Ollama
- **포트 구조 (이게 핵심)**:
  | 서비스 | 내부 포트 | 인증 | 비고 |
  |---|---|---|---|
  | Ollama 본체 | **21434** | ❌ 없음 | `OLLAMA_HOST=0.0.0.0:21434`. LiteLLM은 여기에 붙는다 |
  | Ollama 외부 매핑 | 11434 | ✅ Caddy | `?token=...` 쿼리 토큰만 통과 (OpenAI 앱과 호환 안 됨) |
  | OpenWebUI | 7500 | ✅ Caddy | 웹 UI. 모든 API 경로에 인증 필요 |
- **Caddy 프록시**: Vast.ai가 외부 포트 앞에 세운 인증 게이트. `OPEN_BUTTON_TOKEN`(=`JUPYTER_TOKEN`) 토큰을 `?token=`으로 붙여야 통과.
- **SSH 직접 접속**: 막혀 있는 경우가 많음 (`Connection timed out`). SSH 터널 방식은 기대하지 말 것.
- **OpenWebUI API 키 발급 UI**: 버전(0.9.5)에 따라 Account 화면에 안 나타날 수 있음. → 의존하지 말 것.

> 환경변수 확인 명령: `env | grep -i -E "ollama|open.?webui|password|auth|token|portal"`

---

## 2. 모델 복원 (커스텀 64k 모델)

`qwen3-coder-64k` 는 표준 레지스트리에 없는 **직접 만든 커스텀 모델**이다. `ollama pull`로 못 받는다.
정체 = `qwen3-coder:30b` 베이스 + 컨텍스트 64k(`num_ctx 65536`) + Qwen 권장 샘플링 파라미터.

### 복원 절차

```bash
# 1) 베이스 모델 받기 (표준 레지스트리에 있음)
ollama pull qwen3-coder:30b

# 2) 64k 설정 Modelfile 작성
cat > Modelfile.64k << 'EOF'
FROM qwen3-coder:30b
TEMPLATE {{ .Prompt }}
RENDERER qwen3-coder
PARSER qwen3-coder
PARAMETER repeat_penalty 1.05
PARAMETER stop <|im_start|>
PARAMETER stop <|im_end|>
PARAMETER stop <|endoftext|>
PARAMETER temperature 0.7
PARAMETER top_k 20
PARAMETER top_p 0.8
PARAMETER num_ctx 65536
EOF

# 3) 64k 모델 생성 (이름까지 동일하게 복원)
ollama create qwen3-coder-64k:latest -f Modelfile.64k

# 4) 확인
ollama list
ollama run qwen3-coder-64k:latest "hello"
```

> 다른 모델도 같은 방식. 예: `qwen3.5-35b-64k` 는 `qwen3.5:35b`를 베이스로 동일 Modelfile 적용.
> 기존에 있던 모델: `qwen3-coder-64k:latest`(18GB), `qwen3-coder:30b`(18GB), `qwen3.5:35b`(23GB), `qwen3.5-35b-64k:latest`(23GB) — 전부면 약 82GB.

---

## 3. LiteLLM 프록시 띄우기 (외부 연결의 핵심)

```bash
# 1) 설치
pip install "litellm[proxy]"

# 2) 설정 파일 작성 (master_key는 외부 앱에 넣을 API 키)
cat > /workspace/litellm_config.yaml << 'EOF'
model_list:
  - model_name: qwen3-coder-64k
    litellm_params:
      model: ollama/qwen3-coder-64k:latest
      api_base: http://localhost:21434
general_settings:
  master_key: sk-redsky-1234
EOF

# 3) 실행 (이 터미널은 계속 켜둬야 함)
litellm --config /workspace/litellm_config.yaml --port 4000 --host 0.0.0.0

# (백그라운드로 돌리려면)
# nohup litellm --config /workspace/litellm_config.yaml --port 4000 --host 0.0.0.0 > /workspace/litellm.log 2>&1 &
```

### 내부 동작 확인 (다른 터미널 탭에서)

```bash
curl http://localhost:4000/v1/models -H "Authorization: Bearer sk-redsky-1234"
# → {"data":[{"id":"qwen3-coder-64k",...}]} 나오면 정상
```

> `master_key`(`sk-redsky-1234`)는 원하는 값으로 변경 가능. `sk-`로 시작하면 호환성 좋음.
> `api_base`는 반드시 **21434**(인증 없는 본체). 11434로 하면 Caddy 인증에 막힌다.

---

## 4. 4000번 포트 외부 노출 (Cloudflare 터널)

1. Vast.ai 인스턴스 화면 → **Applications → Tunnels (Open New Ports)**
2. 포트 **`4000`** 추가
3. `http://localhost:4000 → https://<랜덤단어>.trycloudflare.com` 형태의 터널 주소가 생성됨
4. **Copy URL**로 그 주소 복사

> ⚠️ 이 `trycloudflare.com` 주소는 **인스턴스 재시작 때마다 바뀔 수 있는 임시 주소**다. 재시작하면 Tunnels에서 새 주소 확인 필요.

---

## 5. 외부 앱 / Continue 설정

### RAG 앱 / OpenAI 호환 앱

```
엔드포인트 URL: https://<4000번_터널주소>/v1     ← 끝에 /v1 필수
모델명:        qwen3-coder-64k                  ← LiteLLM config의 model_name (:latest 없음)
API 키:        sk-redsky-1234
```

### Continue (config.yaml)

```yaml
models:
  - name: Vast Qwen Coder
    provider: openai
    model: qwen3-coder-64k
    apiBase: https://<4000번_터널주소>/v1
    apiKey: sk-redsky-1234
    roles:
      - chat
      - edit
      - apply
```

### 외부에서 직접 검증 (본인 PC에서)

```bash
curl https://<4000번_터널주소>/v1/models -H "Authorization: Bearer sk-redsky-1234"
```

---

## 6. 트러블슈팅 (에러 메시지별 원인)

| 에러 | 의미 | 원인 / 해결 |
|---|---|---|
| `404 page not found` | 경로 없음 | `apiBase` 끝에 **`/v1`** 누락 |
| `405 Method Not Allowed` | 서버엔 닿았으나 그 경로가 POST 안 받음 | 경로가 API가 아니거나 잘못됨. LiteLLM `/v1`으로 갈 것 |
| `401 Unauthorized` | 인증 필요 | Caddy 인증벽(11434/7500). LiteLLM(4000)으로 우회 |
| `fetch failed` | 주소에 연결 자체가 안 됨 | 터널 안 열림 / 잘못된 주소 / 앱이 도는 위치와 주소 불일치 |
| `docker_build() error writing dockerfile` | 인스턴스 빌드 실패 | **디스크 부족**. 생성 시 디스크 키우거나 다른 호스트로 |

### 경로 탐색용 (인스턴스 안에서)

```bash
curl -i http://localhost:21434/v1/models        # Ollama 본체 (200 OK 기대)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7500/ollama/v1/models  # OpenWebUI 경로별 상태코드
```

---

## 7. 새 인스턴스로 이전할 때 체크리스트

1. **인스턴스 선택** — 가성비는 `DLP/$/hr` 지표로 비교 (높을수록 좋음). DLPerf(성능)/가격/신뢰도/네트워크속도도 같이 본다.
2. **디스크 용량** — 생성 *전에* 슬라이더로 설정. 모델 1개면 **60GB+**, 여러 개면 **120GB+**. (32GB는 빌드 에러 원인)
3. **빌드 실패 시** — 같은 호스트 고집하지 말고 다른 머신(다른 host/machine ID)으로.
4. 모델 복원 → §2
5. LiteLLM 프록시 → §3
6. 4000 터널 → §4
7. 앱/Continue 주소·키 갱신 → §5 (**IP·포트·터널주소가 전부 바뀌므로 매번 갱신**)
8. 검증 끝나면 기존 인스턴스 **🗑️ 삭제(destroy)** — stop은 스토리지 요금 계속 나감. 안 쓸 거면 바로 삭제.

---

## 8. 빠른 재설정 한 줄 요약 (AI에게 줄 때)

> "Vast.ai의 `vastai/openwebui` 템플릿 인스턴스에서 Ollama가 내부 포트 21434(인증 없음)로 돈다. 외부 포트(11434/7500)는 Caddy 인증벽이 있어 OpenAI 호환 앱이 못 붙는다. 그래서 LiteLLM 프록시를 4000번에 띄워 21434에 붙이고, 자체 master_key로 인증을 새로 걸고, 4000번을 Cloudflare 터널로 노출해서 외부 앱이 `https://<터널>/v1` + 키로 접속하게 한다. 커스텀 모델 `qwen3-coder-64k`는 `qwen3-coder:30b` 베이스에 num_ctx 65536을 적용한 Modelfile로 `ollama create` 해서 복원한다."
