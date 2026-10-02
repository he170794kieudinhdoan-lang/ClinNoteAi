import sys
import re
sys.stdout.reconfigure(encoding='utf-8')

SEVERITY_EQUIVALENCE_MAP = {
    "mức độ vừa": ["mức độ vừa", "mức trung bình", "trung bình", "vừa", "vừa phải", "mức vừa"],
    "dữ dội": ["dữ dội", "nghiêm trọng", "rất nặng", "rất đau", "nặng nề"],
    "nhẹ": ["nhẹ", "mức độ nhẹ", "hơi"],
}

def check_item_semantic_coverage(item_text: str, cap_proposition_text: str) -> list[str]:
    """
    Verify that essential duration time-units and qualitative modifiers from cap_proposition_text
    are semantically represented in item_text.
    """
    item_lower = item_text.casefold()
    cap_lower = cap_proposition_text.casefold()
    missing = []

    # 1. Quantitative Duration Modifiers (e.g. "3 tháng", "2 tuần", "5 ngày")
    time_matches = re.findall(r"\b\d+\s*(?:tháng|tuần|ngày|năm|giờ|phút)\b", cap_lower)
    for tm in time_matches:
        if tm not in item_lower:
            missing.append(tm)

    # 2. Qualitative Severity Modifiers with Synonym Equivalence Sets
    for key, synonyms in SEVERITY_EQUIVALENCE_MAP.items():
        if key in cap_lower:
            if not any(syn in item_lower for syn in synonyms):
                missing.append(key)

    return list(dict.fromkeys(missing))

# Test runs
print("Test 1 (Exact match):", check_item_semantic_coverage("Mệt mỏi kéo dài khoảng 3 tháng, mức độ vừa.", "Cảm thấy mệt mỏi ở mức độ vừa, kéo dài 3 tháng."))
print("Test 2 (Synonym match - mức trung bình):", check_item_semantic_coverage("Mệt mỏi ở mức trung bình kéo dài 3 tháng.", "Cảm thấy mệt mỏi ở mức độ vừa, kéo dài 3 tháng."))
print("Test 3 (Synonym match - vừa phải):", check_item_semantic_coverage("Mệt mỏi vừa phải kéo dài 3 tháng.", "Cảm thấy mệt mỏi ở mức độ vừa, kéo dài 3 tháng."))
print("Test 4 (True severity omission):", check_item_semantic_coverage("Mệt mỏi kéo dài 3 tháng.", "Cảm thấy mệt mỏi ở mức độ vừa, kéo dài 3 tháng."))
print("Test 5 (True duration omission):", check_item_semantic_coverage("Mệt mỏi ở mức độ vừa.", "Cảm thấy mệt mỏi ở mức độ vừa, kéo dài 3 tháng."))
