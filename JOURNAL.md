# Weekly Journal — Team T-006

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.
> Nguồn: daily stand-up Discord, `WORKLOG.md`, `SOAP/TRACE.md` và lịch sử Git.
> Cập nhật đến ngày 2026-10-14. Kết quả test kỹ thuật, model output và nghiệm thu lâm sàng được ghi riêng.

---

## Week 1: 2026-09-13 – 2026-09-16

### Mục tiêu tuần này
- [x] Đủ 4 thành viên, clone repo và setup máy
- [x] Mỗi người đọc bank đề tài và mang về một hướng đề xuất
- [x] Họp, vote và chốt một đề làm project cuối kỳ

### Đã hoàn thành
- Nguyễn Hoàng Anh vào đội ngày 13/09, đủ 4/4. Nhóm khởi tạo git, clone repo và đọc các đầu mục đề.
- 14–15/09: lọc bank đề (Đoàn chọn 2 đề, Anh đào sâu DEV-20, cả nhóm brainstorm và vote).
- 16/09: chốt **VMEC-06 — AI Agent trợ lý bác sĩ soạn ghi chú lâm sàng (Clinical Note SOAP)**.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| 13/09 chưa chốt được đề: BTC giao muộn, lịch học và meeting dày | Tách việc: hôm sau mỗi người research một nhánh rồi mới họp | Có shortlist trước buổi vote |
| Bank đề lớn, khó một người bao quát hết | Chia người đọc, mang đề xuất vào brainstorm chung | Chốt VMEC-06 ngày 16/09 |

### Bài học
- Đọc song song rồi họp chốt nhanh hơn việc một người đọc hết bank đề.
- Vote trên list đã lọc, tránh mở lại toàn bộ đề từ đầu.

### Kế hoạch tuần sau
- [x] Viết brief và flow cho VMEC-06
- [x] Làm PRD và wireframe
- [x] Nộp Gate G1 trước 20/09 23:59

---

## Week 2: 2026-09-17 – 2026-09-20

### Mục tiêu tuần này
- [x] Brief và flow thống nhất
- [x] Wireframe / screen flow
- [x] Một bản PRD chung từ các bản cá nhân
- [x] Nộp Gate G1: Brief, PRD, wireframe, setup GitHub

### Đã hoàn thành
- 17/09: mỗi người viết brief (và flow) riêng theo cách hiểu về VMEC-06.
- 18/09: chốt flow và brief, Đoàn vẽ wireframe cùng screen flow, Khuê bắt đầu PRD, Thắng chia việc cụ thể.
- 19/09: PRD cá nhân xong và được chốt theo brief; Anh setup git trên Antigravity; Khuê nộp mentor duty.
- 20/09: gộp thành một PRD, Đoàn format và nộp Gate G1 lúc 11:49. Link: https://drive.google.com/drive/folders/18mMNND2somNSHxjv31Y1nbm_Spni_Y55?usp=drive_link

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Bốn bản brief/PRD dễ lệch nhau | Chốt flow và brief chung trước, rồi lọc ý từ từng PRD cá nhân | Một PRD thống nhất để nộp |
| Sát hạn Gate (20/09 23:59); stand-up của Khuê và Đoàn sáng 20/09 bị tính nộp trễ | Vẫn rà PRD, format tài liệu và nộp trong buổi sáng | Gate G1 đúng hạn |

### Bài học
- Viết riêng rồi merge có nhiều góc nhìn, nhưng phải có một bản chốt trước khi format để nộp.
- Việc nộp gate cần xong từ sớm hơn hạn, vì còn bước gộp và format.

### Kế hoạch tuần sau
- [x] Research hướng làm và các sản phẩm tương tự
- [x] Thử pipeline voice → transcript
- [x] Dựng khung frontend và nháp system diagram, DB schema
- [ ] Chốt system design và database sau khi có bản nháp

---

## Week 3: 2026-09-21 – 2026-09-27

### Mục tiêu tuần này
- [x] Demo voice hội thoại bác sĩ–bệnh nhân thành transcript
- [x] Chốt system design, database schema và flow end-to-end
- [x] Dựng khung frontend, authentication và models ban đầu
- [x] Xác định lại pain point sau khi trải nghiệm sản phẩm tương tự
- [x] Chọn hướng tăng độ tin cậy cho SOAP và bắt đầu MVP

### Đã hoàn thành
- 21–22/09: dựng khung Next.js, chốt system design và database schema; hoàn thành đăng ký/đăng nhập và flow `voice.wav → transcript → gán vai → lưu DB → hiển thị/sửa transcript`.
- 23/09: bổ sung models, UI các màn chính bằng mock data, cấu hình backend/database, Blaze STT, phân vai và API xử lý consultation audio.
- 24/09: Gate G1 được thông báo **PASS** lúc 10:10. Nhóm tiếp tục trải nghiệm sản phẩm tương tự và quy trình khám để kiểm tra lại pain point.
- 24–26/09: phân tích CliniScript, Wavo, Krasyn và các hướng hiện có; thống nhất tập trung vào độ tin cậy của AI khi sinh SOAP.
- 27/09: bắt đầu MVP `Transcript → CAP → SOAP`, dựng UI cơ bản và xây hướng đánh giá confidence, latency, grounding. Code/test kỹ thuật đã có, nhưng các lỗi về revision, grounding và review vẫn được mở để xử lý tiếp.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Flow voice → transcript còn chậm, realtime chưa rõ | Hoàn thiện luồng file audio trước và lưu transcript để có thể sửa | Có flow end-to-end theo lô; realtime chưa triển khai |
| Pain point ban đầu còn rộng | Cả nhóm trực tiếp trải nghiệm sản phẩm tương tự và xem lại feedback mentor | Chốt hướng SOAP có grounding và tăng độ tin cậy |
| Bản MVP đầu tiên có thể tạo output nhưng chưa đủ an toàn để duyệt | Tách lớp CAP, lưu evidence và mở task kiểm tra revision/grounding/review | Có nền tảng MVP; nghiệm thu đầy đủ chuyển sang tuần sau |

### Bài học
- Nên ổn định pipeline theo lô trên dữ liệu có sẵn trước khi mở rộng realtime.
- Output SOAP cần truy ngược được về transcript; confidence phân vai không thay thế đánh giá nội dung lâm sàng.
- Feedback mentor và trải nghiệm sản phẩm thực tế giúp thu hẹp pain point tốt hơn research tài liệu đơn thuần.

### Kế hoạch tuần sau
- [x] Hoàn thiện MVP SOAP có CAP/evidence, revision và review/approve
- [x] Tích hợp workspace SOAP vào lượt khám và chuẩn hóa cách chạy local
- [x] Chuẩn bị architecture diagram, golden set và test case cho Gate G2
- [ ] Xác nhận thao tác UI trọn luồng và review nội dung độc lập

---

## Week 4: 2026-09-28 – 2026-10-04

### Mục tiêu tuần này
- [x] Hoàn thiện MVP SOAP để demo nội bộ
- [x] Tích hợp `Transcript → CAP → SOAP` vào workspace lượt khám
- [x] Thêm cấu hình provider/model và STT Whisper
- [x] Tạo bằng chứng test case cho Gate G2
- [ ] Hoàn tất toàn bộ deliverables Gate G2 và nghiệm thu UI trọn luồng

### Đã hoàn thành
- 28/09: MVP SOAP v1 demo được; workspace dùng chung cho `/soap` và `/encounters/[id]`, hỗ trợ import JSON test riêng với luồng audio của consultation.
- 29–30/09: chuẩn hóa lệnh chạy local, bật SOAP mặc định cho development/test, review lại flow/UI, cập nhật architecture diagram và chia task golden set.
- 01/10: thêm trang Model Settings, cấu hình riêng cho STT/phân vai/CAP/SOAP, nhiều LLM provider, catalog model và Ping. Các kiểm tra phạm vi sửa đạt; ping thật qua 9router thành công, nhưng chưa xác nhận browser và audio hội thoại lâm sàng thật.
- 02/10: sửa các lỗi CAP link, quarantine CAP lỗi và lưu consultation theo bác sĩ; tạo 5 ca bằng model output. Bằng chứng ghi nhận 13/13 liên kết nguồn hợp lệ bằng code, còn 13/13 mục chờ người có chuyên môn review nội dung.
- 02–03/10: bổ sung architecture diagram, README, WORKLOG và tiếp tục harden validation/recovery cho CAP → SOAP.
- 04/10: worklog ghi nhận nhánh gợi ý ICD-10 từ CAP đã có backend, persist, UI hook và 14 test ICD đạt. Phần này được merge lên nhánh chính trong tuần kế tiếp.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| CAP/SOAP có link sai hoặc dữ liệu không đủ an toàn | Siết validation, sửa link, quarantine CAP lỗi và không render CAP không hợp lệ | Tăng độ an toàn cấu trúc; vẫn cần review ngữ nghĩa |
| Provider có contract và quyền truy cập khác nhau | Tách cấu hình theo bước, thêm catalog và Ping, không ghi API key vào artifact | Có thể chọn nhiều provider; catalog không được xem là bằng chứng inference |
| Thời hạn Gate G2 sát, nhiều artifact làm song song | Chia task video, architecture, README, test case và mentor duty | Có phần lớn artifact kỹ thuật; checklist vẫn còn video/pitch deck/AI logs/live URL cần xác nhận |
| UI đã build nhưng thiếu kiểm thử tương tác | Duy trì trạng thái DOING trong trace | Chưa tuyên bố luồng browser đã nghiệm thu |

### Bài học
- Test liên kết bằng code chỉ chứng minh traceability; không chứng minh SOAP đúng về lâm sàng.
- Catalog model cho biết model được quảng bá, còn Ping mới kiểm tra được quyền gọi tại thời điểm đó.
- Tài liệu Gate cần cập nhật đồng thời với code và evidence để tránh claim vượt quá bằng chứng.

### Kế hoạch tuần sau
- [x] Merge và hoàn thiện nhánh ICD suggestion
- [x] Cải thiện UI, PDF workspace, Docker và auth redirect
- [x] Chuẩn bị pitch deck và tài liệu Demo Day
- [ ] Chạy lại toàn bộ quality suite và xác nhận PDF/AI flow end-to-end

---

## Week 5: 2026-10-05 – 2026-10-11

### Mục tiêu tuần này
- [x] Đồng bộ thông tin thành viên và vai trò
- [x] Đưa ICD suggestion vào flow SOAP
- [x] Cải thiện UI và khả năng xuất PDF
- [x] Bổ sung provider cho phân vai và sửa deployment
- [ ] Đưa toàn bộ quality suite về trạng thái sạch

### Đã hoàn thành
- 05/10: cập nhật trách nhiệm, mã sinh viên và đồng bộ thay đổi tài liệu lên nhánh chính.
- 08/10: merge ICD suggestion gồm LLM-grounded suggestion, verify mã qua `icd.kcb.vn`, lưu theo consultation và thanh chọn mã trong flow SOAP. Verify mã chỉ xác nhận mã tồn tại, không xác nhận phù hợp lâm sàng.
- 09/10: cập nhật giao diện, sửa Docker để dependency Python chạy với non-root user và thêm redirect từ domain cũ sang domain chính, giữ OAuth hash token.
- 10/10: cải thiện empty state, skeleton, PDF workspace và chất lượng in; thêm Jev/OpenRouter cho phân vai và sửa schema Decisions API.
- 10/10: backend `/health` và frontend `/soap` từng trả HTTP 200 trong local smoke test sau khi pull code. Kết quả này chỉ xác nhận khởi động/route, không xác nhận AI hoặc PDF end-to-end.
- Chuẩn bị nội dung pitch deck về `Transcript → CAP → SOAP → review/approve`, ICD và giới hạn evidence; artifact slide khi đó vẫn là tài liệu cục bộ đang hoàn thiện.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| ICD dễ bị hiểu như chẩn đoán tự động | Chỉ gợi ý từ CAP current, verify mã và yêu cầu người dùng chọn | Có guardrail kỹ thuật; chưa có đánh giá lâm sàng |
| PDF/UI thay đổi lớn làm tăng lỗi lint và type | Chạy smoke test và kiểm tra từng phạm vi sửa | App khởi động được, nhưng full suite ngày 10/10 còn lỗi |
| Audio compression phía client có rủi ro ảnh hưởng pipeline | Theo dõi sau khi merge | Thay đổi được hoàn tác đầu tuần sau |
| Nhiều artifact demo chưa nằm trong Git | Giữ bản cục bộ và tiếp tục rà nội dung/evidence | Chưa xem pitch deck là deliverable đã bàn giao |

### Bài học
- Một route trả HTTP 200 không đồng nghĩa toàn bộ sản phẩm hoặc test suite khỏe.
- Tính năng y tế bổ sung như ICD cần giới hạn claim và tách đánh giá kỹ thuật khỏi đánh giá chuyên môn.
- Với UI/PDF lớn, cần kiểm tra source của dự án riêng với vendor/generated files để tìm lỗi thực sự.

### Kế hoạch tuần sau
- [x] Hoàn tác audio compression nếu chưa đủ bằng chứng an toàn
- [x] Chặn transcript không liên quan lâm sàng trước CAP/SOAP
- [x] Lưu SOAP theo consultation và rút gọn thao tác approve
- [x] Hoàn thiện README, AI Logs, link frontend deploy và deck
- [ ] Tái chạy quality suite và nghiệm thu browser/model/PDF trọn luồng

---

## Week 6: 2026-10-12 – 2026-10-14 (đang diễn ra)

### Mục tiêu tuần này
- [x] Ổn định đầu vào trước pipeline SOAP
- [x] Cải thiện lưu trữ SOAP và thao tác approve
- [x] Hoàn thiện các artifact còn thiếu trong README
- [ ] Xác nhận backend deploy và luồng end-to-end trên môi trường công khai
- [ ] Đưa các kiểm tra toàn repo về trạng thái đạt

### Đã hoàn thành
- 12/10: hoàn tác client-side audio compression/chuẩn hóa 16 kHz mono vì thay đổi chưa được giữ lại trong phiên bản chính.
- 13/10: thêm clinical relevance gate để chặn transcript không liên quan lâm sàng trước khi tạo CAP/SOAP; có bộ test riêng cho gate.
- 14/10: thêm lưu SOAP theo consultation vào database, rút gọn thao tác approve trên UI và bỏ nhãn draft không còn phù hợp; thêm `.railwayignore` phục vụ đóng gói deploy.
- Cập nhật README theo code tại commit `8741183`, thêm frontend deploy `https://c4-app-006.vercel.app/`. Route `/` và `/soap` đã trả HTTP 200 ngày 14/10; backend/model end-to-end trên deployment chưa được xác nhận.
- Bổ sung ảnh AI Logs vào `docs/evidence/ai-logs-phoenix.png`; cả 4 thành viên đều vượt ngưỡng log được yêu cầu.
- Hoàn thiện nội dung deck 14 slide và lưu lại thiết kế; nội dung tách rõ kết quả kỹ thuật, giới hạn lâm sàng và kế hoạch đo thời gian.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Transcript ngoài ngữ cảnh có thể đi vào CAP/SOAP | Thêm clinical relevance gate trước bước extract | Có chặn ở code/test; cần thử thêm dữ liệu thực tế |
| SOAP trước đây chủ yếu nằm ở JSON run, chưa gắn chặt consultation | Thêm API/model lưu consultation SOAP và nối UI approve | Có persistence mới; cần kiểm tra migration/runtime và mở lại dữ liệu |
| Deploy frontend chưa chứng minh backend/model hoạt động | Ghi rõ phạm vi bằng chứng HTTP 200 | Không claim public end-to-end khi chưa có backend xác nhận |
| Quality suite gần nhất còn lỗi Ruff, pytest, ESLint và TypeScript | Giữ các lỗi trong danh sách cần xử lý, chưa đánh dấu dự án khỏe | Cần chạy lại sau các commit 13–14/10 |

### Bài học
- Guardrail đầu vào nên chạy trước CAP để tránh tốn model call và tạo hồ sơ từ nội dung không liên quan.
- Lưu SOAP theo consultation cần đi cùng revision/final semantics; nút approve nhanh vẫn phải bảo đảm người dùng thực sự review.
- Deployment, AI Logs và slide là artifact bàn giao; chúng không thay thế nghiệm thu chức năng và nội dung lâm sàng.

### Kế hoạch tiếp theo
- [ ] Chạy lại `ruff`, `pytest`, frontend lint/build và xử lý lỗi còn lại theo phạm vi hiện hành
- [ ] Kiểm thử browser toàn luồng: audio → transcript → CAP → SOAP → evidence → sửa → approve → mở lại → PDF
- [ ] Xác nhận backend/model trên deployment, auth và không dùng dữ liệu bệnh nhân thật khi demo
- [ ] Mời người có chuyên môn review các ca model output và ghi kết quả tách khỏi link validation
- [ ] Hoàn tất video demo, screenshot, pitch deck bàn giao và kiểm tra checklist cuối

---
