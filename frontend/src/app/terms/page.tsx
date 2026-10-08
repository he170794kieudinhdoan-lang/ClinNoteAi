"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Scale,
  ShieldAlert,
} from "lucide-react";

export default function TermsAndDisclaimerPage() {
  return (
    <div className="min-h-screen bg-neutral-50/50 text-ink selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="ClinNote AI Logo" className="h-8 w-8 object-contain" />
            <div className="flex flex-col">
              <span className="font-serif text-lg font-bold tracking-tight text-neutral-900 leading-none">ClinNote AI</span>
              <span className="text-[10px] text-neutral-500 font-medium mt-0.5">Clinical Note Assistant</span>
            </div>
          </Link>
          <span className="hidden sm:inline-block text-neutral-300">/</span>
          <span className="hidden sm:inline-block font-mono text-xs text-neutral-500">
            Điều Khoản & Miễn Trừ Trách Nhiệm
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/soap-note-guides-and-example"
            className="hidden md:inline-flex items-center gap-1.5 text-neutral-600 hover:text-emerald-700 transition"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Cẩm nang SOAP</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 transition"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Về trang chủ</span>
          </Link>
          <Link
            href="/desk"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white shadow-2xs hover:bg-emerald-800 transition"
          >
            <span>Vào bàn làm việc</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-neutral-500 mb-6">
          <Link href="/" className="hover:text-emerald-700">Trang chủ</Link>
          <span>/</span>
          <span className="text-neutral-900 font-medium">Điều khoản & Pháp lý</span>
        </nav>

        {/* Page Header */}
        <div className="border-b border-line pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 mb-4">
            <Scale className="h-3.5 w-3.5" />
            <span>Văn Bản Pháp Lý & Quy Chuẩn Lâm Sàng (HITL)</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
            Điều Khoản Sử Dụng & Miễn Trừ Trách Nhiệm Y Tế
          </h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed text-neutral-600">
            Quy định về phạm vi dịch vụ, quyền hạn chuyên môn của Bác sĩ, cơ chế bảo vệ dữ liệu sức khỏe và giới hạn trách nhiệm pháp lý khi sử dụng hệ thống ClinNote AI (Dự án P-006).
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-400">
            <span>Phiên bản: 1.2 (Áp dụng từ 10/2026)</span>
            <span>·</span>
            <span>Mô hình: Human-in-the-Loop (HITL)</span>
            <span>·</span>
            <span>Phạm vi: Lâm sàng & Nghiên cứu Y học</span>
          </div>
        </div>

        {/* PROMINENT MEDICAL DISCLAIMER BANNER */}
        <div className="my-8 rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5 sm:p-6 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl bg-amber-500 p-2 text-white shrink-0 mt-0.5 shadow-2xs">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-2 text-xs sm:text-sm text-amber-950 leading-relaxed">
              <h2 className="font-bold text-sm sm:text-base text-amber-900">
                TUYÊN BỐ QUAN TRỌNG VỀ TRÁCH NHIỆM Y KHOA (MEDICAL DISCLAIMER)
              </h2>
              <p>
                <strong>1. Không Thay Thế Quyết Định Của Bác Sĩ:</strong> ClinNote AI được phát triển nhằm mục đích hỗ trợ ghi nhận và dự thảo biên bản lâm sàng (Documentation Assistant). Hệ thống <strong>tuyệt đối KHÔNG PHẢI là thiết bị chẩn đoán tự động độc lập</strong>, không thay thế cho kiến thức, năng lực đánh giá lâm sàng hoặc quyết định điều trị của Bác sĩ có chứng chỉ hành nghề.
              </p>
              <p>
                <strong>2. Trách Nhiệm Thẩm Định 100% Thuộc Về Bác Sĩ (Human-in-the-Loop):</strong> Mọi bản thảo SOAP, gợi ý mã ICD-10 và tóm tắt hội thoại do AI sinh ra <strong>bắt buộc phải được Bác sĩ trực tiếp thăm khám kiểm tra, hiệu chỉnh và ký duyệt</strong> trước khi lưu vào hồ sơ bệnh án điện tử (EMR/HIS) hoặc ban hành cho người bệnh.
              </p>
              <p>
                <strong>3. Không Sử Dụng Trong Trường Hợp Khẩn Cấp:</strong> Hệ thống không được thiết kế cho các ca cấp cứu ngừng tuần hoàn hô hấp, chấn thương nguy kịch hoặc các tình huống khẩn cấp đe dọa trực tiếp đến tính mạng đòi hỏi can thiệp y tế tức thời.
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Terms Accordion / Sections */}
        <div className="space-y-10 text-neutral-800 text-sm leading-relaxed">
          {/* Section 1 */}
          <section id="section-1" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                01
              </span>
              <span>Bản Chất Dịch Vụ & Mô Hình Human-in-the-Loop</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700">
              <p>
                ClinNote AI cung cấp công cụ AI hỗ trợ chuyển đổi hội thoại thăm khám giữa bác sĩ và bệnh nhân thành bản thảo bệnh án SOAP có cấu trúc, gắn kèm trích dẫn đối chiếu và gợi ý mã hóa ICD-10 của Bộ Y Tế.
              </p>
              <p>
                Nguyên tắc hoạt động cốt lõi của nền tảng là <strong>Human-in-the-Loop (Bác sĩ toàn quyền kiểm soát)</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li>AI đóng vai trò trợ lý thư ký dự thảo (Drafting Assistant), không tự động lưu dữ liệu chưa duyệt vào hệ thống HIS/EMR của bệnh viện.</li>
                <li>Mỗi thông tin ghi nhận trong bản thảo đều gắn kèm trích dẫn đối chiếu (Evidence Grounding) từ biên bản thoại để bác sĩ dễ dàng truy xuất nguồn gốc.</li>
                <li>Bác sĩ có toàn quyền chỉnh sửa, thêm bớt, phủ nhận hoặc viết lại bất kỳ phần nào trong bản thảo SOAP.</li>
              </ul>
            </div>
          </section>

          {/* Section 2 */}
          <section id="section-2" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                02
              </span>
              <span>Phạm Vi Miễn Trừ Trách Nhiệm Chuyên Môn & Pháp Lý</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700">
              <p>
                Người sử dụng (bao gồm bác sĩ, nhân viên y tế, cơ sở khám chữa bệnh) đồng ý và thừa nhận rằng:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="font-bold text-xs uppercase font-mono text-emerald-800">Sai lệch hội thoại</h3>
                  <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
                    Độ chính xác của bản thảo phụ thuộc vào chất lượng thu âm, phát âm, từ ngữ địa phương và mức độ chi tiết của cuộc hội thoại. Đội ngũ phát triển không chịu trách nhiệm đối với các sai sót do tạp âm môi trường hoặc hiểu sai ngữ cảnh của người nói.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="font-bold text-xs uppercase font-mono text-emerald-800">Gợi ý mã ICD-10</h3>
                  <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
                    Mã ICD-10 do hệ thống đề xuất chỉ mang tính chất tham khảo dựa trên từ khóa triệu chứng. Bác sĩ điều trị có trách nhiệm kiểm tra sự phù hợp của mã bệnh đối với danh mục quy định của Bộ Y Tế và chính sách bảo hiểm y tế.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="font-bold text-xs uppercase font-mono text-emerald-800">Chỉ định thuốc & Y lệnh</h3>
                  <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
                    AI không đưa ra liều lượng hoặc phác đồ điều trị mới ngoài những thông tin được bác sĩ trực tiếp trao đổi trong ca khám. Bác sĩ chịu toàn bộ trách nhiệm về tính an toàn, chỉ định và tương tác thuốc của y lệnh ban hành.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="font-bold text-xs uppercase font-mono text-emerald-800">Thiệt hại gián tiếp</h3>
                  <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
                    Ban phát triển ClinNote AI không chịu trách nhiệm đối với bất kỳ khiếu nại, tai biến y khoa, tranh chấp bảo hiểm hoặc tổn thất tài chính nào phát sinh từ việc sử dụng hồ sơ bệnh án không qua rà soát kỹ lưỡng.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="section-3" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                03
              </span>
              <span>Bảo Mật Dữ Liệu Y Tế & Quyền Riêng Tư (Privacy & HIPAA)</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700">
              <p>
                Chúng tôi áp dụng các nguyên tắc bảo mật thông tin y tế nghiêm ngặt, tuân thủ Luật Khám bệnh, chữa bệnh năm 2023, Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và định hướng tiêu chuẩn quốc tế HIPAA:
              </p>
              <ul className="space-y-2 text-xs sm:text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Khử nhận dạng thông tin cá nhân (De-identification):</strong> Hệ thống khuyến nghị và tích hợp cơ chế loại bỏ các thông tin định danh trực tiếp (tên đầy đủ, số CCCD, địa chỉ chi tiết, số điện thoại) trước khi truyền tải qua các mô hình phân tích ngôn ngữ.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Mã hóa đầu cuối (Encryption in Transit & at Rest):</strong> Mọi kết nối truyền dữ liệu âm thanh và văn bản đều được bảo vệ bằng mã hóa TLS 1.3 và lưu trữ an toàn bằng chuẩn AES-256.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Cam kết về dữ liệu huấn luyện:</strong> Dữ liệu âm thanh ca khám và hồ sơ lâm sàng của bệnh nhân <strong>tuyệt đối không được bán, không chia sẻ cho bên thứ ba</strong> và không dùng để tái huấn luyện các mô hình AI mở công cộng khi chưa có sự đồng thuận bằng văn bản.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section id="section-4" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                04
              </span>
              <span>Điều Kiện Sử Dụng & Nghĩa Vụ Của Người Dùng</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700">
              <p>Khi đăng ký và sử dụng ClinNote AI, người dùng cam kết:</p>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 text-xs sm:text-sm">
                <p>
                  • <strong>Tư cách pháp lý:</strong> Người dùng là Bác sĩ, Y sĩ, Điều dưỡng, Dược sĩ, Nhân viên y tế, Sinh viên/Học viên ngành y hoặc cơ sở y tế được cấp phép hoạt động theo quy định pháp luật.
                </p>
                <p>
                  • <strong>Sự đồng thuận của người bệnh:</strong> Trong trường hợp ghi âm trực tiếp tại phòng khám hoặc buổi tư vấn từ xa, người dùng có trách nhiệm thông báo và nhận được sự đồng thuận của người bệnh theo quy định chuyên môn và quy chế của cơ sở y tế.
                </p>
                <p>
                  • <strong>Bảo mật tài khoản:</strong> Không chia sẻ tài khoản đăng nhập, chứng chỉ xác thực số hoặc để lộ dữ liệu bệnh nhân cho các cá nhân không có thẩm quyền tiếp cận hồ sơ bệnh án.
                </p>
                <p>
                  • <strong>Cấm sử dụng sai mục đích:</strong> Nghiêm cấm sử dụng nền tảng vào các mục đích phi y tế, phát tán thông tin giả mạo bệnh lý, hoặc can thiệp can thiệp trái phép vào hệ thống máy chủ.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="section-5" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                05
              </span>
              <span>Quyền Sở Hữu Trí Tuệ & Hồ Sơ Lâm Sàng</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700 text-xs sm:text-sm">
              <p>
                • <strong>Hồ sơ bệnh án chính thức:</strong> Bản ghi bệnh án sau khi được Bác sĩ ký duyệt và xuất ra khỏi hệ thống thuộc quyền quản lý của cơ sở khám chữa bệnh và người bệnh theo Luật Khám bệnh, chữa bệnh.
              </p>
              <p>
                • <strong>Bản quyền nền tảng:</strong> Giao diện, nhãn hiệu ClinNote AI, thuật toán đối chiếu CAP và mã nguồn phần mềm thuộc quyền sở hữu trí tuệ của nhóm nghiên cứu phát triển Dự án ClinNote AI (P-006).
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section id="section-6" className="scroll-mt-20">
            <h2 className="font-serif text-xl font-bold text-neutral-900 flex items-center gap-2.5 pb-2 border-b border-neutral-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                06
              </span>
              <span>Thay Đổi Điều Khoản & Liên Hệ Hỗ Trợ</span>
            </h2>
            <div className="mt-4 space-y-3 text-neutral-700 text-xs sm:text-sm">
              <p>
                Ban quản trị có quyền cập nhật, bổ sung các điều khoản này nhằm đáp ứng các thay đổi về mặt pháp lý y tế hoặc nâng cấp tính năng kỹ thuật. Các thay đổi sẽ được công bố trực tiếp tại trang này kèm theo ngày có hiệu lực mới nhất.
              </p>
              <p>
                Nếu bạn có bất kỳ câu hỏi hoặc góp ý nào về khía cạnh pháp lý, y đức hoặc an toàn dữ liệu, vui lòng liên hệ ban điều hành dự án:
              </p>
              <div className="rounded-xl border border-neutral-200 bg-neutral-100/60 p-4 text-xs font-mono space-y-1">
                <div>Dự án: ClinNote AI — Hệ thống Soạn Bệnh Án SOAP Dựa Trên Bằng Chứng (P-006)</div>
                <div>Kênh hỗ trợ chuyên môn: legal@clinnote.ai / support@clinnote.ai</div>
                <div>Phòng thí nghiệm nghiên cứu Y học Tính toán & AI Lâm Sàng</div>
              </div>
            </div>
          </section>
        </div>

        {/* Back and CTA Footer */}
        <div className="mt-12 pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600 hover:text-emerald-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại trang chủ</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/soap-note-guides-and-example"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 shadow-2xs transition"
            >
              <BookOpen className="h-3.5 w-3.5 text-emerald-700" />
              <span>Xem cẩm nang SOAP</span>
            </Link>
            <Link
              href="/desk"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition"
            >
              <span>Vào bàn làm việc</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-line bg-white py-8 text-center text-xs text-neutral-400">
        <div className="mx-auto max-w-7xl px-4">
          <p>© 2026 ClinNote AI (Dự án P-006). Mọi quyết định chẩn đoán và điều trị thuộc thẩm quyền của Bác sĩ.</p>
        </div>
      </footer>
    </div>
  );
}
