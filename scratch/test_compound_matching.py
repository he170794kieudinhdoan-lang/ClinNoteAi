import re, sys
sys.stdout.reconfigure(encoding='utf-8')

generic_verbs = {
    'sử', 'dụng', 'dùng', 'bị', 'có', 'tiền', 'sử', 'tình', 'trạng',
    'khai', 'ghi', 'nhận', 'cảm', 'thấy', 'nghi', 'ngờ', 'đang', 'hiện',
    'mức', 'độ', 'loại', 'nguy', 'cơ', 'nghiệm', 'pháp', 'kết', 'quả'
}

def get_matching_clauses(clauses: list[str], concept: str, prop: str, norm_soap: str) -> list[str]:
    raw_text = f"{concept} {prop}"
    raw_words = [w for w in re.findall(r"\w+", raw_text.casefold()) if len(w) >= 2 and w not in generic_verbs]
    
    # 2-gram compounds first
    compounds = [f"{raw_words[i]} {raw_words[i+1]}" for i in range(len(raw_words)-1)]
    matching = [c for c in clauses if any(comp in c for comp in compounds)]
    if matching:
        return matching
    
    # Fallback to single word tokens
    matching = [c for c in clauses if any(w in c for w in raw_words)]
    return matching if matching else [norm_soap]

clauses = ["Chưa từng có tiền sử đau thắt lưng năm ngoái", "hiện tại đang bị đau gối trái cấp tính"]

print("CA (tiền sử đau thắt lưng):", get_matching_clauses(clauses, "tiền sử đau thắt lưng", "Chưa từng đau thắt lưng năm ngoái", " ".join(clauses)))
print("CB (đau gối):", get_matching_clauses(clauses, "đau gối", "Hiện tại đau gối trái cấp", " ".join(clauses)))
