# Weekly Journal — Team T-006

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.
> Nguồn: daily stand-up Discord, cùng cách chia ngày với `WORKLOG.md`.

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

Nhật ký cập nhật đến stand-up sáng 22/09. Tuần chưa kết thúc.

### Mục tiêu tuần này
- [x] Demo voice hội thoại bác sĩ–bệnh nhân thành transcript
- [x] Dựng khung frontend và nháp kiến trúc
- [ ] Họp chốt system design và database design
- [ ] Chia việc cụ thể cho từng người
- [ ] Làm rõ flow cho case realtime

### Đã hoàn thành
- Đoàn: tìm hiểu cấu trúc thư mục và tech stack, setup frontend Next.js, vẽ nháp system diagram và DB schema.
- Anh: demo từ bản ghi hội thoại bác sĩ–bệnh nhân ra transcript, dùng model local để nhận diện role.
- Khuê: thử các API cần cho voice và đo inference trên demo thoại có sẵn.
- Thắng: research các nền tảng tương tự.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Hướng voice realtime chưa rõ cơ chế | Làm demo trên bản ghi có sẵn trước: voice → transcript + nhận diện role | Có pipeline demo; realtime vẫn đang nghiên cứu |
| System diagram và DB mới là bản nháp của một người | Đưa vào họp nhóm ngày 22/09 để thống nhất | Chưa chốt trong stand-up sáng 22/09 |

### Bài học
- Chạy được một pipeline trên dữ liệu có sẵn trước khi thiết kế nhánh realtime.
- Bản nháp kiến trúc cần cả nhóm nhìn cùng lúc, tránh mỗi người hiểu một schema.

### Kế hoạch tuần sau
- [ ] Phụ thuộc việc chia task sau họp system design và database (dự kiến trong tuần này, stand-up 22/09 chưa báo đã chốt)

---
