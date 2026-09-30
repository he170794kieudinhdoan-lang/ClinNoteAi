import pytest

from src.services.icd_kcb import detail_from_payload, match_rows, normalize_code, query_code_param, IcdNotFound


def test_detail_drops_html_and_keeps_hierarchy():
    detail = detail_from_payload({
        "status": "success",
        "data": {
            "icd10_code": "M17.9",
            "disease_name_vi": "Thoái hoá khớp gối không đặc hiệu",
            "description_vi": "",
            "chapter": {"code": "XIII", "title": "BỆNH HỆ CƠ, XƯƠNG, KHỚP VÀ MÔ LIÊN KẾT"},
            "section": {"code": "M00-M25", "title": "Bệnh khớp"},
            "parent_group": {"code": "M17", "title": "Thoái hoá khớp gối"},
            "full_html_content": "<div>không gửi ra client</div>",
        },
    })
    assert detail["disease_name_vi"].startswith("Thoái hoá")
    assert detail["chapter"]["code"] == "XIII"
    assert detail["parent_group"]["code"] == "M17"
    assert "full_html_content" not in detail


def test_search_ignores_vietnamese_marks():
    rows = [
        {"code": "M17.9", "title": "Thoái hoá khớp gối không đặc hiệu"},
        {"code": "I10", "title": "Tăng huyết áp nguyên phát"},
    ]
    assert [row["code"] for row in match_rows(rows, "thoai hoa")] == ["M17.9"]
    assert match_rows(rows, "M") == []


def test_normalize_code_rejects_junk():
    assert normalize_code(" m17.9 ") == "M17.9"
    assert normalize_code("M25.562") == "M25.562"
    with pytest.raises(IcdNotFound):
        normalize_code("khớp gối")


def test_query_param_keeps_two_decimal_digits():
    assert query_code_param("M17.9") == "M17.9"
    assert query_code_param("M25.56") == "M25.56"
    assert query_code_param("M25.562") == "M25.56"
    assert query_code_param("A00.1234") == "A00.12"


@pytest.mark.asyncio
async def test_icd_route_returns_detail(client, monkeypatch):
    async def fake(code):
        return {"icd10_code": code, "disease_name_vi": "Tên", "description_vi": "", "chapter": {"code": "XIII", "title": "Cơ"}, "section": {"code": "M00-M25", "title": "Khớp"}, "parent_group": {"code": "M17", "title": "Gối"}}

    monkeypatch.setattr("src.api.routes.lookup_code", fake)
    response = await client.get("/api/v1/icd/codes/M17.9")
    assert response.status_code == 200
    assert response.json()["disease_name_vi"] == "Tên"
    assert "full_html_content" not in response.json()
