# ClinNote AI — P-006

> Hội thoại bác sĩ–bệnh nhân → clinical facts có evidence → SOAP draft để người review kiểm tra, chỉnh sửa và approve.

ClinNote AI hỗ trợ ghi chép lượt khám bằng tiếng Việt. Dự án kết hợp Speech-to-Text (STT), phân vai người nói và pipeline **Transcript → CAP → SOAP**. CAP (*Clinical Atomic Propositions*) là từng thông tin lâm sàng nhỏ, gắn với lời thoại nguồn để người review đối chiếu trước khi duyệt.

**Status: MVP đang phát triển.** Đã có backend, frontend và kết quả đánh giá trên hội thoại tổng hợp; nghiệm thu toàn luồng giao diện và review nội dung độc lập còn thiếu. Xem [Pipeline Documentation](docs/TRANSCRIPT_TO_SOAP_PIPELINE.md) và [Eval Evidence](eval/results/evidence-2026-10-02.md) để đối chiếu implementation và bằng chứng đã lưu trong repo.

**Contents:** [Problem](#problem) · [Solution](#solution) · [Target User](#target-user) · [Features](#features--current-status) · [Workflow](#workflow) · [Demo](#demo) · [Tech Stack](#tech-stack) · [Quick Start](#quick-start) · [Environment Variables](#environment-variables) · [Sample Inputs](#sample-inputs--expected-outputs) · [Architecture](#architecture--project-structure) · [API Endpoints](#api-endpoints) · [Testing](#testing--evaluation) · [Limitations](#known-limitations--deliverables-checklist) · [Team & License](#team--license)

## Problem

Thông tin trong lượt khám nằm rải rác trong hội thoại: triệu chứng, thời gian, thuốc đang dùng, kết quả khám và kế hoạch theo dõi. Người ghi chép cần tổng hợp chúng thành ghi chú có cấu trúc, đồng thời giữ đúng phủ định, sự chưa chắc chắn và các phát biểu được đính chính.

Sinh ghi chú trực tiếp bằng LLM có thể bỏ sót hoặc thêm thông tin, biến kế hoạch thành việc đã thực hiện, hoặc diễn đạt một nghi ngờ thành chẩn đoán chắc chắn. Nếu thiếu evidence, người review khó kiểm tra câu nào xuất phát từ lời thoại nào.

Dự án chưa có khảo sát định lượng hoặc số đo thời gian tiết kiệm tại cơ sở y tế. Các lợi ích này là mục tiêu cần đánh giá, chưa phải kết quả đã chứng minh.

## Solution

ClinNote AI dùng CAP làm lớp trung gian giữa transcript và SOAP:

- **CAP Extraction:** tách các clinical facts, giữ speaker, thời gian, phủ định, uncertainty và trạng thái thuốc/kế hoạch.
- **Evidence Grounding:** nối từng CAP với quote nguyên văn trong transcript; câu SOAP tham chiếu CAP để truy ngược nguồn.
- **SOAP Rendering:** sinh draft từ transcript và CAP đã lưu; phần thiếu thông tin được giữ thiếu để review.
- **Human Review:** người review kiểm tra evidence, sửa câu, xử lý cảnh báo, lưu revision và approve bản cuối.

SOAP gồm **Subjective** (thông tin bệnh nhân kể), **Objective** (quan sát/kết quả khám), **Assessment** (nhận định) và **Plan** (kế hoạch). Mục tiêu là hỗ trợ ghi chép; quyết định chuyên môn vẫn thuộc người review.

## Target User

- **Primary:** bác sĩ/người ghi chép cần tổng hợp hội thoại thành SOAP và đối chiếu từng câu với nguồn.
- **Secondary:** nhóm phát triển và reviewer đánh giá khả năng giữ thông tin, xử lý đính chính và truy vết của pipeline.
- **Current use:** demo, phát triển và đánh giá với dữ liệu tổng hợp; chưa nghiệm thu để sử dụng trên hồ sơ bệnh nhân thật.

## Features & Current Status

“Đã triển khai” mô tả code hiện có; mức kiểm chứng đối chiếu [pipeline docs](docs/TRANSCRIPT_TO_SOAP_PIPELINE.md), [evaluation report](eval/soap/report.md) và [evidence ngày 2026-10-02](eval/results/evidence-2026-10-02.md), không thay cho nghiệm thu sản phẩm.

| Feature | Implementation | Verification / remaining work |
|---|---|---|
| Audio upload và transcript có phân vai | Có luồng Blaze; có adapter Whisper qua 9router/Groq | Có test giả lập và STT ping thật; chưa chấm chất lượng hội thoại audio thật |
| Nhập transcript dạng text, canonical JSON, Qwen JSON | Có parser và UI `/soap`; có Test import ở lượt khám | Có test cấu trúc/adapter; thao tác UI toàn luồng còn chờ xác nhận |
| CAP Extraction và SOAP Rendering | LangGraph có hai operation độc lập | Báo cáo ngày 2026-09-27 ghi nhận 8/8 ca tổng hợp có output ở mỗi hướng |
| Evidence view | Liên kết SOAP → CAP → quote, speaker, segment và timestamp khi có | Kiểm tra ID/quote bằng code; nội dung được nguồn hỗ trợ cần người review xác nhận |
| Revision, review, approve, JSON export | API và workspace chung cho `/soap`, `/encounters/[id]` | Có ca API/store đến final và mở lại; nghiệm thu UI và các edge cases lưu/review còn cần hoàn thiện |
| Model Settings | Cấu hình riêng STT, roles, CAP và SOAP; model catalog và Ping | Có test transport/credential isolation; chưa xác nhận mọi provider/UI |
| CAP quarantine, semantic validation và coverage checks | CAP chưa đủ điều kiện không đưa vào renderer; phân loại lỗi structural/safety, giới hạn repair | Có regression tests trong bản tích hợp với `main`; không thay thế human review |
| ICD-10 suggestion (LLM + verify) | POST `/api/v1/icd/suggest` từ run đã trích CAP; mỗi mã được verify qua icd.kcb.vn trước khi trả về; lưu/duyệt theo consultation | Có unit test loại mã not-grounded; chưa có nghiệm thu UI toàn luồng |

## Workflow

```mermaid
flowchart LR
    A[Audio] --> B[STT + Speaker Roles]
    B --> T[Transcript snapshot]
    J[Text / Canonical / Qwen JSON] --> T
    T --> C[CAP Extraction]
    C --> D[CAP Store + Evidence]
    D --> S[SOAP Draft]
    S --> R[Human Review + Edit]
    R --> F[Approve + Final Revision]
    F --> E[JSON Export]
```

Extract dừng sau khi lưu CAP. Generate là request mới, đọc snapshot đã lưu để tạo SOAP; không chạy lại STT hoặc trích CAP. Chỉ graph quản lý tối đa một lần sửa JSON ở mỗi bước CAP/SOAP.

Khi review, truy theo chuỗi **SOAP item → CAP → transcript quote**. Liên kết hợp lệ chứng minh ID/quote khớp; độ đúng của toàn bộ nội dung câu cần được đánh giá riêng. Sửa transcript tạo run mới; các run cũ giữ snapshot nguồn riêng.

## Demo

### Transcript-only demo

Cách thử ngắn nhất dùng `/soap`, không cần tạo bệnh nhân, upload audio hoặc đăng nhập Supabase. Backend vẫn cần URL/driver database hợp lệ lúc import và một provider LLM hoạt động khi extract/generate.

1. Chạy backend và frontend theo [Quick Start](#quick-start).
2. Mở `http://127.0.0.1:3000/soap`; chọn **Dùng mẫu giả lập**, hoặc dán [Sample Input](#sample-inputs--expected-outputs) vào thẻ **Hội thoại chữ**.
3. Bấm **Lưu hội thoại và tách nguồn** để trích CAP, rồi **Tạo SOAP từ nguồn đã lưu**.
4. Chọn câu SOAP/CAP để xem quote và lượt thoại nguồn. Kiểm tra đúng speaker, phủ định, uncertainty và kế hoạch.
5. Review từng item, xử lý cảnh báo, nhập tên reviewer và lưu thay đổi. Sau khi đủ điều kiện, bấm **Duyệt bản hiện tại**.
6. Dùng **Tải JSON**, rồi mở lại `/soap?run=<run_id>` để kiểm tra revision đã lưu.

Nút dùng mẫu chỉ điền hội thoại; extract/generate vẫn gọi model thật và có thể phát sinh chi phí. Tên reviewer là tên tự khai cho demo, chưa phải chữ ký/xác thực bác sĩ.

### Encounter demo

Luồng đầy đủ cần đăng nhập Supabase và database đã chuẩn bị theo phần [Full encounter setup](#full-encounter-setup).

Tạo bệnh nhân/lượt khám bằng dữ liệu tổng hợp → mở `/encounters/<id>` → **Tải lên** hoặc **Ghi âm** → kiểm tra transcript → tạo CAP/SOAP trong cột SOAP → review/approve. Thẻ **Test import** nhận Qwen/canonical JSON, tạo run thử riêng và không thay audio/transcript của lượt khám.

Các màn demo gồm `/login`, `/patients/new`, `/encounters/<id>`, `/soap` và `/settings`. Screenshot/video nghiệm thu toàn luồng chưa được ghi nhận trong tài liệu hiện hành; trạng thái bàn giao nằm ở [Deliverables Checklist](#deliverables-checklist).

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | LangGraph, LangChain; graph SOAP riêng cho extract/render |
| Backend | FastAPI, Uvicorn, Python; Pydantic validation/settings |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Speech-to-Text | Blaze; Whisper-compatible transport qua 9router/Groq |
| LLM | 9router, OpenAI, Ollama; lựa chọn Gemini/OpenRouter/Groq trong Model Settings |
| Database & Auth | SQLAlchemy, PostgreSQL/Supabase cho luồng lượt khám; Supabase Auth trên frontend |
| SOAP Storage | JSON files có snapshot/hash và revision trong `data/soap_mvp/` |
| Testing | pytest, pytest-asyncio, HTTPX, Ruff, ESLint, TypeScript |
| DevOps | Docker backend, Docker Compose, GitHub Actions CI cho backend |

Dependency backend nằm trong [requirements.txt](requirements.txt); frontend trong [package.json](frontend/package.json) và [package-lock.json](frontend/package-lock.json). Vector store/RAG chưa thuộc pipeline SOAP hiện tại.

## Quick Start

### Prerequisites

- Python **3.11** là phiên bản CI/Docker đang dùng.
- Node.js **20.9+**, npm và Git cho frontend.
- Một provider LLM với model/key hợp lệ để chạy CAP/SOAP. 9router/Ollama là dịch vụ riêng, repo không tự khởi động chúng.
- PostgreSQL/Supabase và tài khoản đăng nhập chỉ cần cho luồng lượt khám đầy đủ. Transcript-only demo dùng SQLite in-memory để app import mà không kết nối database thật.

Các lệnh dưới đây dùng Bash trên Linux/macOS. Windows có thể chạy bằng WSL; PowerShell activate venv bằng `.venv\Scripts\Activate.ps1`.

### 1. Clone & install backend

```bash
git clone https://github.com/AI20K-Build-Phase-Cohort-4/P-006.git
cd P-006
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Với checkout đã có sẵn, dùng môi trường hiện tại hoặc tạo venv mới với tên riêng; không cần clone hoặc tạo lại venv.

### 2. Configure backend

Nếu chưa có `.env`, tạo từ `.env.example`. Nếu đã có, giữ file hiện tại và chỉnh các biến cần thiết. Với LLM mặc định qua 9router, cấu hình tối thiểu sau là **ví dụ**, không phải key/model đã được cấp sẵn:

```dotenv
APP_ENV=development
SOAP_ENABLED=true
DB_AUTO_CREATE_TABLES=false
DATABASE_URL=sqlite:///:memory:
SOAP_DATA_DIR=./data/soap_mvp
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

LLM_PROVIDER=9router
NINEROUTER_BASE_URL=http://127.0.0.1:20128/v1
NINEROUTER_API_KEY=YOUR_9ROUTER_API_KEY
NINEROUTER_MODEL=YOUR_ACCESSIBLE_MODEL_ID
```

Thay hai placeholder bằng cấu hình được provider của bạn cấp. Các biến `NINEROUTER_*` được đọc bởi `src/config.py`; có thể cần bổ sung vào `.env` vì `.env.example` chưa liệt kê chúng. Nếu dùng OpenAI, đặt `LLM_PROVIDER=openai`, `OPENAI_API_KEY` và `MODEL_NAME` thay cho nhóm 9router. Không cần key STT khi chỉ nhập transcript.

### 3. Run backend

Từ thư mục gốc, sau khi activate venv:

```bash
APP_ENV=development SOAP_ENABLED=true DB_AUTO_CREATE_TABLES=false \
DATABASE_URL=sqlite:///:memory: \
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Lệnh này dành cho transcript-only demo; các giá trị trên command line ghi đè `.env`. SOAP vẫn lưu ở `SOAP_DATA_DIR`, còn SQLite in-memory không có dữ liệu lượt khám. Một worker là cấu hình demo cho JSON store hiện tại.

### 4. Run frontend

Mở terminal thứ hai:

```bash
cd P-006/frontend
npm install --ignore-scripts
```

Nếu terminal đã ở thư mục gốc repo, dùng `cd frontend`. Tạo `frontend/.env.local` nếu chưa có và đặt:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Mở **http://127.0.0.1:3000/soap**. Không cần cấu hình Supabase cho route demo độc lập này.

### 5. Verify startup

```bash
curl --fail-with-body http://127.0.0.1:8000/health
curl --fail-with-body http://127.0.0.1:8000/openapi.json \
  | python -c 'import json,sys; print("\n".join(p for p in json.load(sys.stdin)["paths"] if p.startswith("/api/v1/soap/")))'
```

Health trả `status=ok`; OpenAPI phải có **6 SOAP paths**. Swagger UI ở **http://127.0.0.1:8000/docs**. `/health` thành công chưa chứng minh SOAP router đã được bật.

### Full encounter setup

1. Chuẩn bị Supabase project riêng cho demo. Frontend cần `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`; bật phương thức đăng nhập sẽ dùng và cấu hình redirect URL theo host frontend.
2. Chuẩn bị database PostgreSQL cùng project. Trên database demo mới, dùng [scripts/supabase_schema.sql](scripts/supabase_schema.sql) trong SQL Editor để tạo các bảng và policies. Script có phần thay function, drop/recreate trigger và policies cho `public.users`; trên database đã có dữ liệu/cấu hình, cần rà soát và xác nhận từng thay đổi trước khi áp dụng, không reset database. Repo cũng có [Alembic migration](alembic/versions/ce09ff47001e_create_initial_database_schema.py); không chạy cả hai cách khởi tạo trên cùng schema.
3. Đặt `DATABASE_URL` backend tới database đó, dạng `postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require`. Dùng connection string được project cấp, URL-encode password khi cần và giữ credential trong `.env`.
4. Chạy backend từ thư mục gốc với `APP_ENV=development`, `SOAP_ENABLED=true`, `DB_AUTO_CREATE_TABLES=false`, một worker. **Bỏ override `DATABASE_URL=sqlite:///:memory:` của transcript-only demo** để backend đọc PostgreSQL từ `.env`:

   ```bash
   APP_ENV=development SOAP_ENABLED=true DB_AUTO_CREATE_TABLES=false \
   python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --workers 1
   ```

5. Restart frontend sau khi thay `.env.local`, đăng nhập và kiểm tra profile `public.users` có ID khớp Supabase Auth user. Frontend có bước sync profile; tạo consultation yêu cầu doctor tồn tại trong bảng này.
6. Cấu hình STT và roles trong `/settings` trước khi upload audio. Mặc định STT dùng Blaze và cần `BLAZE_API_KEY`; có thể chọn 9router/Groq Whisper với model/key phù hợp.

Supabase Auth hiện bảo vệ một số màn frontend; backend demo chưa có lớp xác thực API tương ứng. Giữ demo trên `127.0.0.1`, không dùng cấu hình này để công khai API hồ sơ.

### Troubleshooting

| Symptom | Check |
|---|---|
| SOAP API trả 404 | Kiểm tra `APP_ENV=development/test`, `SOAP_ENABLED=true`, restart backend và xem OpenAPI |
| CORS/preflight lỗi | `NEXT_PUBLIC_API_URL` là URL backend, không kèm `/api/v1`; `CORS_ORIGINS` phải khớp host/port frontend |
| Provider trả 401/403 | Key đúng provider và đủ quyền; restart backend nếu đổi key `.env` |
| Provider/model trả 404 hoặc 429 | Kiểm tra URL, model ID, quyền truy cập và hạn mức; model catalog không bảo đảm gọi model được |
| Không tạo được bệnh nhân/lượt khám | Không dùng SQLite in-memory cho luồng này; kiểm tra PostgreSQL schema và doctor profile |
| Bị chuyển tới `/login` | Các màn lượt khám/Cài đặt cần Supabase; dùng `/soap` cho demo transcript độc lập |
| Generate/review/approve trả 409 | Đọc lại run, lấy revision mới nhất, đối chiếu thay đổi và trạng thái review trước khi gửi lại |
| Dev/build gặp lỗi Turbopack | Có thể thử `npm run dev -- --webpack --hostname 127.0.0.1 --port 3000` hoặc `npm run build -- --webpack`; giữ nguyên artifacts cũ |

## Environment Variables

Backend đọc `.env` tại thư mục làm việc qua [src/config.py](src/config.py); chạy từ root repo. Frontend dùng `frontend/.env.local`. Bảng dưới ghi default trong code hoặc giá trị mẫu an toàn, không chứa credential thật.

### Backend — app & storage

| Variable | Required / scope | Default / example | Purpose |
|---|---|---|---|
| `APP_ENV` | SOAP/model-settings cần development/test | `development` | Quyết định mount các API demo |
| `SOAP_ENABLED` | Bật để dùng SOAP | `true` | Bật/tắt SOAP router trong development/test |
| `DB_AUTO_CREATE_TABLES` | Demo đặt `false` | Code default `true` | Cho phép/tắt `create_all` lúc startup; `false` không bỏ yêu cầu URL/driver DB hợp lệ |
| `DATABASE_URL` | App cần URL/driver hợp lệ | Demo `sqlite:///:memory:` | Database connection; lượt khám đầy đủ dùng PostgreSQL đã chuẩn bị |
| `CORS_ORIGINS` | Khi dùng frontend khác origin | `http://localhost:3000,http://127.0.0.1:3000` | Danh sách origin, phân cách bằng dấu phẩy |
| `SOAP_DATA_DIR` | Tùy chọn | `./data/soap_mvp` | Lưu snapshot, CAP, attempts và revisions |
| `SOAP_MAX_TURNS` | Tùy chọn | `200` | Số lượt thoại tối đa |
| `SOAP_MAX_CHARS` | Tùy chọn | `30000` | Số ký tự phần hội thoại tối đa |
| `SOAP_MAX_INPUT_BYTES` | Tùy chọn | `1000000` | Kích thước đầu vào SOAP tối đa theo validation |
| `SOAP_LLM_TIMEOUT` | Tùy chọn | `45` | Timeout SOAP rendering, tính bằng giây |
| `CAP_EXTRACTION_TIMEOUT` | Tùy chọn | `60` | Timeout riêng cho CAP extraction, tính bằng giây |
| `SOAP_LLM_MODEL` | Tùy chọn | Để trống | Override model CAP/SOAP mặc định |
| `SOAP_LLM_TEMPERATURE` | Tùy chọn | `0.0` | Temperature CAP/SOAP |
| `LOG_LEVEL` | Tùy chọn | `INFO` | Trường cấu hình logging; log level Uvicorn có thể đặt bằng CLI |

`APP_HOST` và `APP_PORT` có trong Settings; khi gọi Uvicorn trực tiếp, dùng `--host` và `--port` như Quick Start để đặt địa chỉ listen.

### Backend — providers

| Variable | Required / scope | Default / example |
|---|---|---|
| `LLM_PROVIDER` | Provider mặc định cho LLM | `9router`; nhận `9router`, `openai`, `ollama` |
| `NINEROUTER_BASE_URL` | Khi dùng 9router | `http://localhost:20128/v1` |
| `NINEROUTER_API_KEY` | Theo xác thực của 9router đang dùng | `YOUR_9ROUTER_API_KEY` |
| `NINEROUTER_MODEL` | Model được tài khoản truy cập | Code default `ag/gemini-3.8-flash`; thay nếu endpoint không cung cấp alias này |
| `OPENAI_API_KEY`, `MODEL_NAME` | Khi dùng OpenAI | Key riêng; model default `gpt-4o-mini` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Khi dùng Ollama | `http://localhost:11434`; model đã tải trên máy chủ Ollama |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Khi chọn Gemini trong Model Settings | Key/model riêng; model không có default trong code |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Khi chọn OpenRouter trong Model Settings | Key/model riêng; model không có default trong code |
| `GROQ_API_KEY`, `GROQ_MODEL` | Khi chọn Groq | LLM cần model phù hợp; STT mặc định dùng `whisper-large-v3` |
| `BLAZE_API_KEY`, `BLAZE_API_URL` | Khi STT dùng Blaze | URL default `https://api.blaze.vn/v1/stt/execute` |
| `LLM_TEMPERATURE` | Tùy chọn cho các bước LLM khác SOAP | `0.7` |

Trong `/settings`, provider/model/URL được chọn riêng cho `stt`, `roles`, `caps`, `soap`. Các lựa chọn không chứa key lưu trong localStorage; API key nhập thêm chỉ giữ trong bộ nhớ tab, cần nhập lại khi reload. SOAP records được lưu trên backend, không dùng localStorage làm hồ sơ.

`LLM_PROVIDER` chỉ nhận ba giá trị trong bảng; chọn Gemini/OpenRouter/Groq bằng Model Settings hoặc `model_config_override`, không đặt chúng trực tiếp vào biến này. STT 9router mặc định chọn `groq/whisper-large-v3`; model phải hỗ trợ audio transcription. Whisper phân vai từ nội dung text, không xác nhận danh tính giọng nói.

### Frontend & optional integrations

| Variable | Required / scope | Example / purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Để frontend gọi backend | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Đăng nhập và luồng lượt khám | `https://YOUR_PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Đăng nhập và luồng lượt khám | Public anon key của project; không dùng service-role key |
| `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` | Tùy chọn LangSmith tracing | `false` khi không cần gửi trace; nếu bật, chỉ dùng dữ liệu demo phù hợp |
| `AI_LOG_SERVER`, `AI_LOG_API_KEY`, `AI_LOG_DIR` | AI usage logging cho coursework | Cấu hình theo Phoenix; độc lập với CAP/SOAP runtime |
| `PARSE_API_KEY`, `PARSE_ICD_BASE_URL` | Tùy chọn ICD lookup có sẵn | Không cần cho MVP CAP/SOAP |

Biến `NEXT_PUBLIC_*` được đưa tới trình duyệt; không đặt provider secret hoặc database password ở đây. Không commit `.env`/`.env.local`, key thật hoặc log có dữ liệu nhạy cảm. Restart server tương ứng sau khi đổi biến môi trường.

## Sample Inputs & Expected Outputs

Các ví dụ bên dưới là **synthetic data**. Expected output minh họa điều người review cần kiểm tra; không phải kết quả model thật đã chạy cho README.

### Sample transcript

```text
Patient: Tôi đau gối trái ba ngày.
Doctor: Khám thấy gối trái sưng nhẹ.
Doctor: Có thể là viêm khớp.
Doctor: Nếu còn đau thì tái khám tuần sau.
```

Parser text nhận prefix `Doctor:`, `Patient:`, `Bác sĩ:` hoặc `Bệnh nhân:`. Canonical JSON dùng `speaker=clinician/patient`:

```json
{
  "schema_version": "1.0",
  "language": "vi",
  "turns": [
    {"turn_id": "T1", "speaker": "patient", "text": "Tôi đau gối trái ba ngày."},
    {"turn_id": "T2", "speaker": "clinician", "text": "Khám thấy gối trái sưng nhẹ."},
    {"turn_id": "T3", "speaker": "clinician", "text": "Có thể là viêm khớp."},
    {"turn_id": "T4", "speaker": "clinician", "text": "Nếu còn đau thì tái khám tuần sau."}
  ],
  "source_metadata": {"synthetic": true}
}
```

Khi có timestamp, truyền `start_ms` và `end_ms` cùng nhau. Thiếu timestamp để `null` hoặc bỏ cả hai trường, không tạo mốc giả. Qwen JSON dùng profile `qwen_role_result`; adapter giữ ID, vai và thời gian nguồn. Bộ ca tổng hợp đầy đủ nằm trong [eval/soap/cases.json](eval/soap/cases.json).

### Expected CAP & SOAP

| CAP | Evidence | Expected SOAP section / behavior |
|---|---|---|
| C1: đau gối trái ba ngày | T1, “đau gối trái ba ngày” | **S:** giữ vị trí và thời gian |
| C2: gối trái sưng nhẹ qua khám | T2, “gối trái sưng nhẹ” | **O:** chỉ ghi quan sát đã nêu |
| C3: có thể viêm khớp | T3, “Có thể là viêm khớp” | **A:** giữ uncertainty, không khẳng định chẩn đoán |
| C4: tái khám tuần sau nếu còn đau | T4, “Nếu còn đau thì tái khám tuần sau” | **P:** giữ điều kiện, không diễn đạt đã tái khám |

Ví dụ cấu trúc SOAP draft hợp lệ:

```json
{
  "S": {"items": [{"item_id": "S1", "text": "Đau gối trái ba ngày", "cap_ids": ["C1"]}], "missing": false},
  "O": {"items": [{"item_id": "O1", "text": "Gối trái sưng nhẹ", "cap_ids": ["C2"]}], "missing": false},
  "A": {"items": [{"item_id": "A1", "text": "Có thể viêm khớp", "cap_ids": ["C3"]}], "missing": false},
  "P": {"items": [{"item_id": "P1", "text": "Nếu còn đau thì tái khám tuần sau", "cap_ids": ["C4"]}], "missing": false}
}
```

ID/nội dung output thật có thể khác. Item mới có `review_status=needs_review`, `support_status=pending`; schema defaults không đồng nghĩa đã được review. Nếu transcript không có dữ liệu cho một section, cấu trúc là `{"items": [], "missing": true}`.

### Sample API requests

Backend phải đang chạy và provider được cấu hình. Extract/generate gọi model; các request đọc run/export không gọi model.

**1. Extract CAP từ transcript text:**

```bash
curl --fail-with-body -X POST http://127.0.0.1:8000/api/v1/soap/extract-caps \
  -H 'Content-Type: application/json' --data @- <<'JSON'
{
  "input_format": "text",
  "content": "Patient: Tôi đau gối trái ba ngày.\nDoctor: Khám thấy gối trái sưng nhẹ.\nDoctor: Có thể là viêm khớp.\nDoctor: Nếu còn đau thì tái khám tuần sau."
}
JSON
```

Response có `run_id`, `transcript`, `caps`, `cap_warnings`, `cap_repair_count`, `model_metadata`. Extract chưa tạo SOAP revision. Với canonical JSON, dùng `input_format=canonical` và đặt object mẫu vào `content`.

**2. Generate SOAP:** thay `REPLACE_WITH_RETURNED_RUN_ID` bằng `run_id` từ response bước 1.

```bash
RUN_ID='REPLACE_WITH_RETURNED_RUN_ID'
curl --fail-with-body -X POST "http://127.0.0.1:8000/api/v1/soap/runs/$RUN_ID/generate" \
  -H 'Content-Type: application/json' --data '{"expected_revision":0}'
```

Response chứa `run_id`, object `revision`, `soap_repair_count` và `model_metadata`. Lần generate đầu tạo revision 1, status `draft`.

**3. Read & export draft:**

```bash
curl --fail-with-body "http://127.0.0.1:8000/api/v1/soap/runs/$RUN_ID"
curl --fail-with-body "http://127.0.0.1:8000/api/v1/soap/runs/$RUN_ID/export?revision=1"
```

Read trả snapshot/CAP, danh sách `revisions`, `latest_revision` và trạng thái CAP. Export trả `schema_version`, `run_id`, metadata, transcript, CAP, cảnh báo và revision đã chọn; draft cũng có thể export, cần kiểm tra `revision.status`.

**4. Review & approve:** dùng UI hoặc `POST /runs/{run_id}/revisions` để gửi `expected_revision`, toàn bộ object `soap`, tên reviewer và quyết định cảnh báo. Sau khi thực sự kiểm tra từng câu, lưu trạng thái review/support phù hợp. Mỗi lần lưu, generate hoặc approve tạo revision mới; luôn đọc revision hiện tại trước khi ghi.

Ví dụ sau một lần generate và một lần lưu review, revision hiện tại là 2:

```bash
curl --fail-with-body -X POST "http://127.0.0.1:8000/api/v1/soap/runs/$RUN_ID/approve" \
  -H 'Content-Type: application/json' \
  --data '{"expected_revision":2,"reviewer_name":"Demo reviewer","warning_decisions":{}}'
```

Lệnh approve chỉ thành công khi các điều kiện review/cảnh báo đã được xử lý; không thể approve ngay draft đang `pending`. Bản final mới có revision 3 trong ví dụ này; export bằng `?revision=3`. Nếu đã có thao tác khác, số revision sẽ khác.

### Sample Queries

Đối với SOAP, “query” là hội thoại đầu vào và các ca cần kiểm tra. Có thể thử thêm:

- **Negation:** bệnh nhân nói “Tôi không sốt” → không đổi thành triệu chứng sốt.
- **Correction:** bệnh nhân đính chính thuốc đang dùng → giữ evidence và lịch sử, kiểm tra CAP hiện hành.
- **Missing information:** chỉ có bệnh nhân mô tả triệu chứng → không tự thêm khám, chẩn đoán hoặc kế hoạch.
- **Conditional plan:** bác sĩ đề nghị xét nghiệm nếu triệu chứng kéo dài → giữ điều kiện trong P.

`POST /api/v1/chat` là endpoint agent mẫu được giữ từ template, chưa phải trợ lý tư vấn lâm sàng; không dùng kết quả chat để chứng minh chất lượng SOAP.

## Architecture & Project Structure

```mermaid
flowchart TB
    UI[Next.js UI] --> API[FastAPI :8000]
    UI --> AUTH[Supabase Auth]
    API --> ENCOUNTER[Patient / Consultation / Transcript services]
    ENCOUNTER --> DB[(PostgreSQL)]
    ENCOUNTER --> STT[STT + Roles adapters]
    API --> GRAPH[LangGraph SOAP: extract / render]
    GRAPH --> SERVICES[CAP / SOAP / Validation services]
    SERVICES --> LLM[LLM adapters]
    SERVICES --> STORE[(JSON SOAP Store)]
    API --> REVIEW[Review / Approve / Export service]
    REVIEW --> STORE
```

Database lưu bệnh nhân, lượt khám và transcript của luồng audio. JSON store SOAP là nguồn dữ liệu bền vững cho input snapshot, CAP, attempts và revisions; chưa đồng bộ final SOAP vào các bảng SOAP của consultation. Frontend giữ liên kết run để mở workspace; mỗi run lấy dữ liệu từ backend.

```text
P-006/
├── src/
│   ├── main.py                       # FastAPI entry point
│   ├── config.py                     # Settings / environment variables
│   ├── database.py                   # SQLAlchemy engine / sessions
│   ├── agents/soap_graph.py          # Extract / render graph
│   ├── api/                          # Encounter, SOAP, model-settings routes
│   ├── schemas/                      # CAP / SOAP / model-settings contracts
│   ├── models/                       # SQLAlchemy models + API schemas
│   └── services/                     # STT, roles, transcript, SOAP, providers
├── frontend/src/
│   ├── app/                          # Routes: login, encounters, soap, settings
│   ├── components/soap/              # Workspace, review, evidence panels
│   └── lib/                          # API clients / model preferences
├── data/soap_mvp/                    # Runtime artifacts; giữ riêng từng run
├── tests/                            # pytest; SOAP dùng fake LLM + temp store
├── eval/soap/                        # Synthetic cases, runner, evaluation report
├── scripts/                          # Supabase schema / AI usage logging
├── alembic/                          # Database migration infrastructure
├── docs/                             # Pipeline docs / architecture / guidebook
├── presentation/                     # Demo Day material instructions
├── .github/workflows/ci.yml          # Backend Ruff + pytest
├── JOURNAL.md                        # Weekly development journal
├── WORKLOG.md                        # Team worklog
├── Dockerfile / docker-compose.yml   # Backend container configuration
└── README_boilerplate.md             # Original project README framework
```

Đọc sâu theo thứ tự: [Architecture Diagram](docs/architecture-diagram.md) → [Transcript-to-SOAP Pipeline](docs/TRANSCRIPT_TO_SOAP_PIPELINE.md) → [SOAP Graph](src/agents/soap_graph.py) → [Evaluation Report](eval/soap/report.md) → [Latest Published Evidence](eval/results/evidence-2026-10-02.md). `ARCHITECTURE.md` và `docs/architecture_diagram.md` còn nội dung template; file mới của nhóm là `docs/architecture-diagram.md` (dùng dấu gạch ngang). API table trong README và OpenAPI từ app là nguồn đối chiếu endpoint thực tế.

## API Endpoints

Base URL local: `http://127.0.0.1:8000`. Swagger/OpenAPI ở `/docs`, `/openapi.json`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check, không gọi model |
| GET | `/api/v1/status` | Trạng thái agent mẫu |
| POST | `/api/v1/chat` | Chat với agent mẫu |
| POST | `/api/v1/patients` | Tạo patient trong database |
| POST | `/api/v1/consultations` | Tạo consultation; cần patient và doctor hợp lệ |
| GET | `/api/v1/consultations?doctor_id=...` | Danh sách lượt khám theo doctor; dùng để tải lại dashboard |
| POST | `/api/v1/consultations/{id}/audio` | Multipart `audio_file`, tùy chọn `model_preferences`; gọi STT/roles |
| GET | `/api/v1/consultations/{id}/transcript` | Đọc transcript đã lưu |
| PATCH | `/api/v1/transcript-segments/{id}` | Sửa content của segment |
| POST | `/api/v1/soap/extract-caps` | Nhập transcript, lưu snapshot và trích CAP |
| POST | `/api/v1/soap/runs/{run_id}/generate` | Render SOAP từ snapshot/CAP, cần `expected_revision` |
| GET | `/api/v1/soap/runs/{run_id}` | Đọc run và revision history |
| POST | `/api/v1/soap/runs/{run_id}/revisions` | Lưu draft sau review/edit |
| POST | `/api/v1/soap/runs/{run_id}/approve` | Approve đúng revision và điều kiện review |
| GET | `/api/v1/soap/runs/{run_id}/export?revision=N` | Export JSON của revision đã chọn |
| POST | `/api/v1/model-settings/models` | Lấy model catalog cho step/provider; không inference |
| POST | `/api/v1/model-settings/ping` | Gọi provider để kiểm tra kết nối thực; có thể tính phí |
| GET | `/api/v1/icd/search?q=...` | ICD lookup có sẵn, ngoài nghiệm thu MVP SOAP |
| GET | `/api/v1/icd/codes/{code}` | Chi tiết mã ICD có sẵn |
| POST | `/api/v1/icd/suggest` | LLM gợi ý ICD-10 từ CAP của run; verify danh mục trước khi trả (thuộc luồng SOAP demo) |
| POST | `/api/v1/consultations/{id}/icd-suggestions` | Lưu/upsert suggestions cho consultation (HITL) |
| GET | `/api/v1/consultations/{id}/icd-suggestions` | Đọc suggestions đã lưu của consultation |
| PATCH | `/api/v1/icd-suggestions/{suggestion_id}` | Cập nhật status SUGGESTED/ACCEPTED/REJECTED |

SOAP APIs chỉ mount khi `SOAP_ENABLED=true` và `APP_ENV=development/test`; model-settings APIs cũng chỉ mount trong development/test. Model Settings request có `step` (`stt`, `roles`, `caps`, `soap`) và `preference` gồm provider/model/baseUrl, tùy chọn apiKey. CAP/SOAP nhận override qua `model_config_override`.

Pydantic validation lỗi trả 422; revision stale hoặc chưa đủ điều kiện approve trả 409. Các lỗi provider/store cần đối chiếu response và log đã bỏ thông tin nhạy cảm; kiểm tra các nhánh lỗi riêng trước khi nghiệm thu. Request/response đầy đủ xem [SOAP schemas](src/schemas/soap.py), [model settings schemas](src/schemas/model_settings.py) và Swagger của backend đang chạy.

## Testing & Evaluation

### Local checks

Từ root repo, sau khi activate venv:

```bash
ruff check src/ tests/
pytest tests/ -v
python eval/soap/run_eval.py
```

SOAP tests cấu hình `APP_ENV=test`, SQLite in-memory, tắt tự tạo bảng trước import app; dùng fake LLM/HTTP provider và store tạm. Evaluator mặc định chỉ xác thực cấu trúc/quote của **8 ca tổng hợp**, không gọi model.

Trong `frontend/`:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Sau khi tích hợp cập nhật `main` ngày **2026-10-03**, backend suite ghi nhận **256 passed, 7 skipped**; các test cần fixture local không có được skip theo điều kiện trong test. Ruff toàn `src/ tests/` được kiểm tra lại trước bàn giao. Chạy các lệnh trên để lấy kết quả cho checkout của bạn; kết quả backend không đồng nghĩa frontend build/lint hoặc UI acceptance đã đạt.

Kiểm tra README ngày **2026-10-03**: local links/anchors, cú pháp Bash, JSON schemas và bảng API khớp route decorators đều đạt; evaluator xác thực 8 ca tổng hợp. Sample transcript trong README đi qua extract → generate → read → export bằng **fake LLM**, SQLite in-memory và store tạm; draft pending bị từ chối approve với HTTP 409. Kiểm tra app trong process xác nhận health 200 và 6 SOAP paths trong OpenAPI; chưa chạy browser hoặc provider thật trong lượt viết tài liệu này.

### Live model evaluation

Sau khi kiểm tra provider, chạy từ root với backend SOAP đang hoạt động:

```bash
python eval/soap/run_eval.py --run-model --limit 1
```

Đây là lượt gọi thật, có thể tính phí. Mỗi ca thường có 3 lời gọi chính: baseline trực tiếp, extract CAP và render SOAP; có thể thêm một lượt sửa JSON cho mỗi bước CAP/SOAP. Chỉ mở rộng `--limit 8` sau khi kiểm tra output ca đầu. Runner lưu kết quả trong thư mục UUID mới ở `data/soap_mvp/eval/`.

### Recorded evaluation

Nhóm đã bổ sung [5 ca có output model thật ngày 2026-10-02](eval/results/evidence-2026-10-02.md) bằng OpenAI `gpt-4o-mini-2024-07-18`: ca đủ SOAP, thiếu khám/nhận định, phủ định triệu chứng, nhận định chưa chắc chắn và đính chính thuốc. Cả baseline và CAP pipeline có output ở 5/5 ca; các file review vẫn `pending_human_review`. Bản artifacts được đưa vào `eval/results/`, đọc được sau khi clone repo; chưa phải kết quả được bác sĩ xác nhận.

Kết quả dưới đây trích từ [evaluation report](eval/soap/report.md), lượt chạy **2026-09-27**, qua 9router với alias `gemini-3.8-flash`; không phải lượt chạy mới khi viết README.

| Method | Successful cases | Model calls | Median generation time / case | Evidence verification |
|---|---:|---:|---:|---|
| Direct SOAP baseline | 8/8 | 8 | 7.449 s | Không có lớp CAP |
| CAP → SOAP | 8/8 | 16, 0 repair | 20.213 s | 27/27 SOAP items có liên kết CAP hợp lệ bằng code |

27/27 items vẫn ở trạng thái chờ human review. Liên kết hợp lệ chưa chứng minh toàn bộ nội dung được evidence hỗ trợ; audit nội dung trong report chỉ là nhận xét sơ bộ có hỗ trợ AI. Chưa có xác nhận lâm sàng độc lập, số đo thời gian review hoặc chi phí tiền từ provider.

### AI usage logging

Repo kế thừa hooks AI20K cho Claude Code, Cursor, Codex, Gemini CLI, Copilot và Antigravity. Xem [scripts/setup_hooks.sh](scripts/setup_hooks.sh) hoặc [scripts/setup_hooks.ps1](scripts/setup_hooks.ps1) để cài trên checkout mới sau khi kiểm tra cấu hình hooks hiện có. `AI_LOG_API_KEY` lấy riêng từ [Phoenix dashboard](https://phoenix.note.transformerlabs.ai/api-keys); key này khác provider LLM key.

Pre-push hook gửi log tới grading server khi được cấu hình hợp lệ. Việc có file hook chưa chứng minh log của mọi công cụ hoặc mọi lần push đã được hệ thống chấm nhận. Với prompt demo dùng công cụ web, có thể ghi thủ công:

```bash
bash scripts/_pyrun.sh scripts/log_manual.py --tool chatgpt --prompt "Explain the synthetic CAP to SOAP demo"
```

Chỉ ghi prompt tổng hợp an toàn; không đưa dữ liệu bệnh nhân hoặc secret vào log nộp bài. [Technical Guidebook](docs/guide/chapter-01.md) và [Deliverables Checklist gốc](docs/guide/deliverables/checklist.md) cung cấp yêu cầu coursework.

## Known Limitations & Deliverables Checklist

### Known limitations

- **Clinical validation:** chưa có review độc lập trên hội thoại thật; không tuyên bố đã giảm hallucination hoặc tiết kiệm thời gian bằng số liệu lâm sàng.
- **Acceptance issues:** audit local trước đây ghi nhận lỗi đọc run khi attempt ghi dở, suy trạng thái superseded, chuyển section phải review lại và chuẩn hóa lỗi khởi tạo model. `main` đã bổ sung nhiều kiểm tra grounding/semantic; cần tái nghiệm thu từng tình huống trên bản tích hợp, không suy rằng tất cả lỗi cũ đã hết chỉ từ số test đạt.
- **UI verification:** chưa có bằng chứng thao tác trọn luồng từ nhập → sửa → duyệt → mở lại trên browser cho mọi màn.
- **Audio quality:** Whisper suy vai từ text; có thể từ chối segment chứa nhiều vai/thiếu ngữ cảnh. Confidence phân vai không phải độ tin cậy SOAP.
- **Storage & concurrency:** JSON store demo dùng một worker; liên kết SOAP final vào database consultation/EHR chưa được triển khai trong MVP này.
- **Security & deployment:** backend demo chưa có xác thực API tương ứng với frontend login. Docker Compose hiện chỉ cấu hình backend, không phải full stack frontend/database/provider; chưa dùng để công khai demo hồ sơ.
- **Scope:** ICD lookup có code riêng nhưng không thuộc nghiệm thu CAP/SOAP; Event Consolidation, FHIR/EHR integration, tự chẩn đoán/kê đơn và RAG nằm ngoài phạm vi hiện tại.
- **ICD suggestion:** gợi ý tự động từ CAP có bỏ lọc bằng chứng (not-grounded/negated/superseded bị loại) và verify icd.kcb.vn; confidence chỉ là chỉ định hiển thị, chưa có review lâm sàng độc lập; mã gợi ý không tự append vào SOAP, mỗi suggestion vẫn cần bác sĩ chủ động chọn (ACCEPTED). `/soap` demo không lưu suggestion xuống DB.

Ưu tiên tiếp theo: tái nghiệm thu các edge cases lưu/grounding/review → xác nhận UI toàn luồng → review nội dung độc lập → hoàn thiện demo artifacts. Không đánh dấu task triển khai DONE chỉ vì README đã đầy đủ.

### Deliverables Checklist

Checklist này phản ánh bằng chứng trong checkout/tài liệu hiện hành, không xác nhận đã nộp hoặc đã được chấm. Các mục chưa hoàn tất ghi rõ phần còn thiếu.

- [x] **Source Code:** backend, frontend và tests có trong repo P-006.
- [x] **README.md:** mô tả sản phẩm, setup, environment variables, samples và giới hạn.
- [x] **Architecture Diagram:** sơ đồ MVP trong README và [docs/architecture-diagram.md](docs/architecture-diagram.md).
- [ ] **AI Logs:** hooks/scripts có sẵn; cần xác nhận log bắt buộc đã được grading server nhận.
- [ ] **Live URL / Deploy:** chưa có URL deployment được xác nhận trong tài liệu hiện hành.
- [ ] **Video Demo & Screenshots:** cần ghi nhận ca tổng hợp hoàn tất toàn luồng; hướng dẫn ở [presentation/README.md](presentation/README.md).
- [ ] **Pitch Deck:** cần deck hoàn chỉnh, không chỉ template hướng dẫn.
- [x] **Weekly Journal:** có [JOURNAL.md](JOURNAL.md); cập nhật trước bàn giao.
- [x] **Worklog:** có [WORKLOG.md](WORKLOG.md); cập nhật trước bàn giao.
- [ ] **Evaluation Evidence:** có bộ ca và model outputs/report; còn thiếu human review độc lập và UI acceptance evidence.

## Team & License

### Team

Repository: **P-006**, AI20K Build Phase Cohort 4.

Vai trò kế thừa bảng Team trên main; trách nhiệm dưới đây tổng hợp theo công việc đã ghi trong [WORKLOG.md](WORKLOG.md) đến ngày 03/10/2026. Các thành viên phối hợp triển khai và review; bảng thể hiện mảng phụ trách chính.

| Member | Role | Responsibilities | Student ID |
|---|---|---|---|
| Đoàn Quang Thắng | Research & Product (nghiên cứu, PRD, MVP SOAP) | Tổng hợp brief/PRD, chia việc; nghiên cứu hướng sinh SOAP; triển khai và kiểm thử MVP SOAP, hỗ trợ nhiều LLM provider; hoàn thiện README. | 2A202602395 |
| Kiều Đình Đoàn | Tech Lead / Frontend (phụ trách kỹ thuật, giao diện và trải nghiệm người dùng) | Thiết kế wireframe/screen flow; dựng giao diện Next.js, đăng ký/đăng nhập và các màn hình workflow; cải thiện UI/UX; tổng hợp worklog. | 2A202602936 |
| Nguyễn Hà Khuê | Backend & Architecture (backend, kiến trúc và dữ liệu) | Thiết kế hệ thống, schema database và models; tích hợp LLM provider, sửa lỗi lưu bệnh nhân và sinh SOAP; xây dựng architecture diagram, metrics và test case. | 2A202602938 |
| Nguyễn Hoàng Anh | AI/ML & QA (luồng AI, kiểm thử và demo) | Tích hợp audio → transcript → phân vai → lưu/hiển thị; tinh chỉnh prompt CAP/SOAP và validation; xử lý lỗi CAP → SOAP; tạo voice test và quay video demo MVP. | 2A202602811 |

### Contributing & License

Dự án phát triển trên AI20K Agent Template; giữ [README_boilerplate.md](README_boilerplate.md) làm khung tham khảo. Đọc [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md) trước khi đóng góp hoặc báo vấn đề bảo mật; tuân thủ hướng dẫn `AGENTS.md` nếu checkout local có file này.

**License:** [MIT](LICENSE). Copyright gốc của template: AI20K Build Phase, 2026.
