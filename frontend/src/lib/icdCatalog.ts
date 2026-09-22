import type { IcdSuggestion } from "@/types";

/** MOCK: danh mục ICD cục bộ để ô tìm kiếm có kết quả. Sẽ thay bằng GET /api/v1/icd. */
export const ICD_CATALOG: IcdSuggestion[] = [
  { code: "M17.9", title: "Thoái hóa khớp gối, không xác định" },
  { code: "M17.0", title: "Thoái hóa khớp gối nguyên phát hai bên" },
  { code: "M16.9", title: "Thoái hóa khớp háng, không xác định" },
  { code: "M25.562", title: "Đau khớp gối trái" },
  { code: "M25.561", title: "Đau khớp gối phải" },
  { code: "M25.569", title: "Đau khớp gối, không xác định" },
  { code: "M25.462", title: "Tràn dịch khớp gối trái" },
  { code: "M25.511", title: "Đau khớp vai phải" },
  { code: "M54.2", title: "Đau cổ" },
  { code: "M54.5", title: "Đau thắt lưng" },
  { code: "M75.1", title: "Hội chứng chóp xoay" },
  { code: "M23.2", title: "Rối loạn sụn chêm do rách cũ" },
  { code: "S83.2", title: "Rách sụn chêm, hiện tại" },
  { code: "J00", title: "Viêm mũi họng cấp" },
  { code: "J02.9", title: "Viêm họng cấp, không xác định" },
  { code: "J03.9", title: "Viêm amidan cấp, không xác định" },
  { code: "J06.9", title: "Nhiễm trùng hô hấp trên cấp, không xác định" },
  { code: "J20.9", title: "Viêm phế quản cấp, không xác định" },
  { code: "J45.9", title: "Hen phế quản, không xác định" },
  { code: "I10", title: "Tăng huyết áp nguyên phát" },
  { code: "I11.9", title: "Bệnh tim do tăng huyết áp, không suy tim" },
  { code: "E11.9", title: "Đái tháo đường type 2, không biến chứng" },
  { code: "E78.5", title: "Rối loạn lipid máu, không xác định" },
  { code: "K21.0", title: "Trào ngược dạ dày thực quản có viêm thực quản" },
  { code: "K29.7", title: "Viêm dạ dày, không xác định" },
  { code: "A09", title: "Tiêu chảy và viêm dạ dày ruột" },
  { code: "R10.4", title: "Đau bụng, không xác định" },
  { code: "R51", title: "Đau đầu" },
  { code: "G43.9", title: "Đau nửa đầu, không xác định" },
  { code: "R50.9", title: "Sốt, không xác định" },
  { code: "R05", title: "Ho" },
  { code: "N39.0", title: "Nhiễm trùng đường tiết niệu" },
  { code: "H10.9", title: "Viêm kết mạc, không xác định" },
  { code: "L30.9", title: "Viêm da, không xác định" },
  { code: "B34.9", title: "Nhiễm virus, không xác định" },
  { code: "Z00.0", title: "Khám sức khỏe tổng quát" },
  { code: "R69", title: "Nguyên nhân bệnh chưa xác định" },
];

export const ICD_CODE = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function searchIcd(query: string, suggestions: IcdSuggestion[]) {
  const needle = fold(query.trim());
  const seen = new Set<string>();
  const pool = [...suggestions, ...ICD_CATALOG].filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
  if (!needle) return suggestions.slice(0, 8);
  return pool
    .filter((item) => fold(item.code).includes(needle) || fold(item.title).includes(needle))
    .slice(0, 12);
}
