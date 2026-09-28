# Đánh giá SOAP: baseline trực tiếp và pipeline CAP

## Trạng thái hiện tại

Bộ đánh giá gồm 8 hội thoại hoàn toàn tổng hợp. Lượt model thật hoàn chỉnh gần nhất là [`482a14c4-7b16-4d7a-beb2-2ca4af382ed6`](../../data/soap_mvp/eval/482a14c4-7b16-4d7a-beb2-2ca4af382ed6/summary.json), chạy ngày 2026-09-27 qua 9router với alias model `gemini-3.8-flash`. Cả baseline trực tiếp và pipeline CAP đều có output ở 8/8 ca. Các số chấm nội dung bên dưới chỉ là **audit sơ bộ có hỗ trợ AI** trên hội thoại tổng hợp, chưa được bác sĩ hoặc reviewer độc lập xác nhận. Mọi item do model tạo vẫn ở trạng thái chờ review.

| Bằng chứng | Trạng thái |
|---|---|
| 8 ca tổng hợp với facts, evidence, trạng thái, điều cấm thêm và phần được phép thiếu | Có trong `cases.json` |
| Chạy evaluator ở chế độ chỉ đọc/kiểm tra bộ ca | Có; không gọi API hoặc model |
| Kết quả baseline trực tiếp từ provider | 8/8 ca trong lượt đánh giá gần nhất |
| Kết quả CAP pipeline từ provider | 8/8 ca trong lượt đánh giá gần nhất |
| Audit sơ bộ nội dung và liên kết | Có hỗ trợ AI; không thay đánh giá lâm sàng của người review |
| Demo từ nhập transcript đến mở lại bản final | Có một ca tổng hợp qua API/store: run `315a4468-f123-47e1-9d1a-68416c561527`, final revision 3; giao diện chưa được thao tác trọn luồng |

## Cách chạy

Từ thư mục gốc repo:

```bash
python eval/soap/run_eval.py
```

Lệnh này chỉ xác thực cấu trúc và quote trong bộ ca; không gọi mạng hay đọc khóa provider. Khi backend SOAP và provider đã được cấu hình, bắt đầu bằng đúng một ca:

```bash
python eval/soap/run_eval.py --run-model --limit 1
```

Chỉ sau khi kiểm tra output của ca đầu, có thể chạy toàn bộ 8 ca bằng `--limit 8`. Mỗi lần chạy tạo thư mục UUID mới dưới `data/soap_mvp/eval/`; runner không ghi đè hoặc dọn artifacts cũ. Cần để runner và backend dùng cùng cấu hình provider/model. Mặc định API trỏ tới `http://127.0.0.1:8000/api/v1/soap`, timeout 60 giây; có thể đổi bằng `--api-base` và `--timeout`.

Ngân sách chuẩn tối đa 3 lời gọi chính mỗi ca: 1 baseline trực tiếp, 1 extract CAP, 1 render SOAP. Với 8 ca, con số chính kỳ vọng là 24; mỗi graph step có thể phát sinh tối đa một lượt sửa JSON, tức tối đa 16 lượt sửa thêm. Runner đọc model metadata từ extract/generate và `attempt_summary` từ run nếu backend cung cấp; khi không có metadata, số invocation/retry được đánh dấu **không quan sát được**. Không suy ra số thực từ số request. Ca lỗi vẫn được lưu kèm stage và phản hồi lỗi. Runner chỉ lưu output thô và metadata sẵn có, không tự chấm câu hoặc gán `supported`.

## Quy tắc chấm

Reviewer cần đọc transcript, kỳ vọng trong `cases.json`, baseline, CAP, SOAP và evidence trước khi ghi điểm. Chấm từng fact và từng item; không suy điểm từ việc quote tồn tại. Fact có `required_in_soap=false` vẫn cần giữ trạng thái/lịch sử trong CAP khi phù hợp, nhưng không bị tính là fact hiện tại bắt buộc xuất hiện trong SOAP. Link hợp lệ do kiểm tra ID/quote bằng code và nội dung được evidence hỗ trợ do reviewer đánh giá là hai kết quả riêng.

| Chỉ số | Tử số / mẫu số |
|---|---|
| Giữ facts | Facts kỳ vọng được giữ đúng / facts kỳ vọng có output đủ để chấm |
| Thêm thông tin không có nguồn | Assertions không được transcript hỗ trợ / tổng assertions được reviewer kiểm tra |
| Đúng trạng thái | Facts thuốc, thời gian, phủ định hoặc uncertainty có trạng thái đúng / số facts loại này được chấm |
| Liên kết CAP hợp lệ | Liên kết CAP có ID và quote khớp / liên kết CAP đã kiểm tra; baseline ghi N/A |
| Nội dung được evidence hỗ trợ | Items được reviewer đánh giá supported / items được reviewer đánh giá; không thay bằng kiểm tra liên kết |
| Đặt đúng phần SOAP | Facts đặt đúng phần / facts kỳ vọng có nguồn và được chấm; phần `may_be_missing` không bị coi là lỗi khi thiếu |
| Item cần sửa | Items reviewer đánh dấu cần sửa / tổng items đã review |
| Thời gian | Thời gian sinh do runner đo; thời gian bắt đầu review đến duyệt chỉ ghi khi có đo thật |

Ca lỗi hoặc output chưa qua review phải được báo riêng; không điền điểm thay cho reviewer. Mỗi chỉ số phải kèm tử số, mẫu số và số ca lỗi/không chấm. Ghi token và chi phí chỉ khi provider trả metadata tương ứng; nếu không có thì ghi “không được cung cấp”.

## Kết quả lượt model thật gần nhất

| Phương pháp | Ca thành công / đã chạy | Lượt gọi model | Token input + output | Trung vị thời gian sinh/ca | Liên kết bằng code | Nội dung được reviewer xác nhận |
|---|---:|---:|---:|---:|---|---|
| Baseline trực tiếp | 8/8 | 8 | 25.616 + 1.256 = 26.872 | 7.449 ms | N/A | Chưa đo |
| CAP → SOAP | 8/8 | 16 (8 CAP + 8 SOAP), 0 lượt sửa | 65.295 + 5.040 = 70.335 | 20.213 ms | 27/27 item SOAP có link hợp lệ | Chưa đo; 27/27 item còn `pending` |

Tổng hai hướng là 24 lượt gọi và 97.207 token. Thời gian trên đo ở runner cho từng ca; pipeline cộng thời gian extract và render. Provider không cung cấp chi phí tiền. Chưa đo thời gian reviewer từ lúc bắt đầu đến lúc duyệt. Tất cả 8 revision của pipeline là nháp và cả 8 file review ghi `pending_human_review`.

Audit sơ bộ có hỗ trợ AI đối chiếu output với `cases.json`: baseline thể hiện rõ 25/26 fact SOAP bắt buộc; một fact về mâu thuẫn thuốc chỉ hàm ý. Pipeline thể hiện 26/26 fact SOAP bắt buộc, nhưng CAP chỉ có 28/30 fact kỳ vọng và các nhãn trạng thái CAP khớp chính xác 23/30. Hai fact CAP thiếu đều thuộc ca mâu thuẫn thuốc chưa giải quyết. Những tỷ lệ này là nhận xét sơ bộ, **không phải điểm chất lượng lâm sàng đã nghiệm thu**. Chưa chấm chính thức số assertion vô căn cứ, độ hỗ trợ nội dung của evidence, đúng phần SOAP hoặc tỷ lệ item cần sửa.

Các lỗi cần sửa trước khi dùng ngoài demo: hai triệu chứng bị phủ định có `clinical_status=unknown` thay vì `active`; một CAP mô tả chườm lạnh thêm vị trí cổ tay dù quote không nêu; ca mâu thuẫn thuốc thiếu CAP riêng cho sự không rõ tên/đối tượng thuốc; nhãn uncertainty ở ca cảm nhận sưng và kế hoạch MRI có chỗ lệch kỳ vọng. Renderer có vài từ thêm như “tiếp tục” hoặc “đi khám lại” cần người review kiểm tra. Liên kết ID/quote hợp lệ không chứng minh toàn bộ nội dung câu được nguồn hỗ trợ.

Lượt trước [`dd9e437e-6b12-4070-a938-f1ed2cd79a71`](../../data/soap_mvp/eval/dd9e437e-6b12-4070-a938-f1ed2cd79a71/summary.json) cũng tạo output 8/8 mỗi hướng. Sau audit lượt này, prompt/validation được sửa để phân biệt việc đã xảy ra với kế hoạch và trạng thái không dùng thuốc. Lượt mới cải thiện ca đính chính thuốc và cách diễn đạt kế hoạch, nhưng các lỗi còn lại ở trên chưa được giải quyết. Probe đầu tiên `19f96207-026f-4838-8500-215dfb413ba9` thất bại ở CAP do JSON có code fence và enum sai; parser/prompt đã sửa, probe tiếp theo `105a6b16-4734-4503-9830-6fb40747df35` thành công. Lượt `12d6def0-4c27-412b-ba2c-7ddd0e2926dc` dừng khi đang chạy nên không tính vào bảng; artifacts đã giữ nguyên.

Không kết luận phương pháp nào tốt hơn về chất lượng lâm sàng khi chưa có review độc lập. Bộ ca tổng hợp không đại diện cho mọi hội thoại lâm sàng.
