# Kiến trúc mã nguồn Backend (`src/`)

> Cập nhật theo code tại commit `8741183` ngày 2026-10-14.
> Sơ đồ toàn hệ thống: [docs/architecture_diagram.md](../docs/architecture_diagram.md).
> Hợp đồng CAP/SOAP chi tiết: [docs/TRANSCRIPT_TO_SOAP_PIPELINE.md](../docs/TRANSCRIPT_TO_SOAP_PIPELINE.md).

## Module Map

```text
src/
├── main.py                       # FastAPI app, CORS và router mounting
├── config.py                     # Settings từ environment
├── database.py                   # SQLAlchemy engine/session
├── api/
│   ├── routes.py                 # Patient, consultation, audio, transcript, SOAP summary, ICD lookup
│   ├── soap_routes.py            # Extract, generate, revision, approve, JSON export
│   ├── model_settings_routes.py  # Provider catalog và ping
│   └── icd_routes.py             # ICD suggest và consultation review lifecycle
├── agents/
│   ├── graph.py                  # Graph chat mẫu còn tồn tại
│   ├── soap_graph.py             # Graph SOAP với operation extract/render
│   ├── soap_state.py             # State của SOAP graph
│   ├── nodes/                    # Node mẫu và node SOAP gọi service/store
│   └── tools/                    # Tool mẫu/legacy của template
├── schemas/                      # Pydantic contracts cho SOAP, ICD và Model Settings
├── models/                       # SQLAlchemy entities và schema HTTP consultation cũ
└── services/
    ├── audio/                    # Lưu audio tạm
    ├── blaze/                    # Blaze STT
    ├── clinical_gate/            # Heuristic + model relevance gate
    ├── speaker/                  # Speaker role classification
    ├── transcript/               # Normalize và persist transcript
    ├── soap/                     # Extract, render, validate, store, review
    ├── stt.py                    # Whisper-compatible adapters
    ├── llm.py                    # Factory LLM dùng cấu hình server/request
    ├── model_runtime.py          # Resolve provider/model theo invocation
    ├── model_catalog.py          # Provider model discovery
    ├── icd_suggest.py            # LLM-grounded ICD suggestion
    └── icd_kcb.py                # Lookup/verify mã ICD
```

## Router Mounting

`src.main:app` dùng chung cổng 8000:

- `/health`: health check nằm ngoài prefix `/api/v1`.
- `/api/v1/chat`, `/api/v1/status`: endpoint legacy của graph chat mẫu.
- `/api/v1/patients`, `/api/v1/consultations/*`: patient, consultation, audio, transcript và bản SOAP tóm tắt trong SQL.
- `/api/v1/model-settings/models`, `/api/v1/model-settings/ping`: chỉ mount trong `development` hoặc `test`.
- `/api/v1/soap/*`: chỉ mount khi `SOAP_ENABLED=true` và môi trường là `development` hoặc `test`.
- `/api/v1/icd/search`, `/api/v1/icd/codes/{code}`, `/api/v1/icd/suggest`, `/api/v1/consultations/{id}/icd-suggestions` và `/api/v1/icd-suggestions/{id}`: luôn được mount; lifecycle ICD là service riêng, không nằm trong LangGraph SOAP.

Trong lifespan, `DB_AUTO_CREATE_TABLES=true` gọi `Base.metadata.create_all(...)`. Đây là tiện ích khởi tạo bảng, không thay thế migration database.

## Main Request Flows

### Audio consultation

```text
upload audio
→ Blaze hoặc Whisper STT
→ clinical relevance gate
→ speaker role classification nếu CLINICAL
→ transcript normalization
→ SQL transcript persistence
```

`NON_CLINICAL` dừng trước phân vai. `UNCERTAIN` lưu transcript chưa phân vai để người dùng kiểm tra.

### SOAP

```text
text / canonical / Qwen JSON
→ normalize
→ clinical gate
→ JSON snapshot
→ CAP extraction + validation
→ render SOAP + safety validation
→ JSON revision
→ human review / approve / export
```

Extract và render là hai invocation riêng. Graph không truy vấn consultation database; frontend chuyển transcript consultation thành canonical input. API consultation SOAP lưu thêm bản S/O/A/P tóm tắt và run ID vào SQL.

### ICD

```text
SOAP run ID
→ load current CAPs from JSON store
→ LLM proposes ICD codes with cap_ids
→ deterministic grounding
→ verify code against icd.kcb.vn
→ user accepts/rejects
→ SQL persistence by consultation
```

Verify mã chỉ xác nhận mã tồn tại trong danh mục, không chứng minh phù hợp lâm sàng.

## Layer Rules

- Routes validate HTTP input, map errors and call graph/services. Không đặt prompt hoặc business rules trong route.
- Graph nodes điều phối state và gọi services. Không truy vấn SQL trực tiếp trong SOAP graph.
- Services giữ provider calls, prompt parsing, validation, store và review rules.
- `src/schemas/` giữ hợp đồng SOAP/ICD/Model Settings; `src/models/schemas.py` giữ request/response patient, consultation và transcript hiện có. Các file model còn lại là SQLAlchemy persistence.
- Retry model có giới hạn do SOAP graph quản lý; không chồng retry ngầm ở service/client.
- API key từ Model Settings chỉ đi theo request và được giữ trong bộ nhớ của tab; không ghi vào JSON store, database, log hoặc browser storage.

## Storage Boundary

| Store | Owns |
|---|---|
| SQL database | users, patients, consultations, transcript segments, SOAP summary theo consultation, ICD suggestions |
| JSON SOAP Store | raw/canonical snapshot, CAPs, model attempts, warnings, revisions và final run |
| Browser localStorage | model preferences không chứa API key, `soapRunId`, PDF presets và một số UI preferences |
| Browser sessionStorage | draft chuyển sang PDF workspace và trạng thái UI tạm thời |

Route consultation SOAP hiện đọc và cập nhật bản ghi mới nhất trong `soap_notes`; nó chưa cung cấp lịch sử append-only tương đương revision trong JSON Store. JSON Store và SQL `soap_notes` cũng chưa có transaction đồng bộ final thống nhất. Đây là khoảng trống kiến trúc cần xử lý trước khi dùng dữ liệu thật.

## Security Boundary

- Frontend dùng Supabase session để bảo vệ luồng giao diện và lấy `doctor_id`.
- Các router FastAPI hiện chưa có dependency xác thực token hoặc kiểm tra quyền sở hữu patient/consultation ở backend.
- Vì vậy backend hiện phù hợp với môi trường demo nội bộ; chưa nên công khai API xử lý dữ liệu lâm sàng nếu chưa bổ sung authentication, authorization và audit access.

## Out of Scope

Pipeline hiện không dùng Vector Store/RAG, SSE/WebSocket streaming, FHIR/EHR, Event Consolidation, tự chẩn đoán hoặc tự kê đơn.
