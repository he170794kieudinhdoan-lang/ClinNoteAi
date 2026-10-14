# Evaluation Evidence Summary

> Tổng hợp artifact đánh giá đã lưu trong repo. Đây là bằng chứng kỹ thuật trên hội thoại tổng hợp, không phải xác nhận chất lượng lâm sàng.

## Phạm vi bằng chứng

- Bộ chuẩn hiện có: 8 ca tổng hợp trong [`eval/soap/cases.json`](../soap/cases.json).
- Gói deliverable ngày 2026-10-02: 5 ca chạy model thật bằng OpenAI `gpt-4o-mini-2024-07-18`.
- Mỗi ca có manifest, baseline output, CAP extraction, SOAP generation, run snapshot, export, review template và pipeline summary.
- Artifact chi tiết nằm trong [`eval/results/evidence-2026-10-02/`](evidence-2026-10-02/); bảng diễn giải nằm tại [`evidence-2026-10-02.md`](evidence-2026-10-02.md).

## Kết quả quan sát được

| Chỉ số | Kết quả | Ý nghĩa |
|---|---:|---|
| Ca có output baseline | 5/5 | Provider trả output parse được cho cả 5 ca |
| Ca có output CAP → SOAP | 5/5 | Extract và render hoàn thành cho cả 5 ca |
| Lượt gọi provider | 15 | 5 baseline + 5 extract CAP + 5 render SOAP |
| Repair JSON | 0 | Không phát sinh lượt sửa JSON trong 5 ca này |
| Token baseline | 3 287 | Tổng usage do provider trả về |
| Token CAP → SOAP | 25 549 | Tổng extract và render |
| Tổng token | 28 836 | Baseline cộng CAP pipeline |
| Human review hoàn tất | 0/5 | Tất cả `*.review.json` còn `pending_human_review` |

`5/5` ở đây chỉ là tỷ lệ tạo được output, không phải accuracy, clinical correctness hoặc acceptance rate.

## Hành vi đã có artifact

1. Hội thoại đủ S/O/A/P.
2. Phần thiếu được biểu diễn bằng `missing=true`.
3. Triệu chứng phủ định được giữ trong output.
4. Assessment không chắc chắn không bị nâng thành chẩn đoán xác định.
5. Phát biểu dùng thuốc được đính chính và giữ khả năng truy vết.

## Giới hạn

- Dữ liệu là hội thoại tổng hợp, không phải audio/STT hoặc hồ sơ bệnh nhân thật.
- Review template chưa được reviewer độc lập điền; chưa có điểm chính thức về giữ facts, unsupported assertions, đúng section hoặc item cần sửa.
- Chưa có bằng chứng thao tác browser toàn luồng và chưa đo thời gian review/approve.
- Lượt chạy ngày 2026-10-02 có trước clinical gate và các cập nhật UI/database tháng 10; cần chạy acceptance mới để đại diện cho pipeline hiện tại.
- Báo cáo 8 ca và phương pháp chấm chi tiết nằm tại [`eval/soap/report.md`](../soap/report.md).

## Trạng thái deliverable

`Evaluation Evidence (eval/results/)` đã có đủ gói 5 ca model thật và báo cáo để bàn giao. Human review độc lập, browser acceptance và đánh giá lâm sàng là công việc xác minh tiếp theo, không được suy ra từ trạng thái hoàn thành của deliverable này.
