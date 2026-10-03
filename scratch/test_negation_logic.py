import re, sys
sys.stdout.reconfigure(encoding='utf-8')

def _normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', text.casefold().strip())

def _extract_core_concept_tokens(canonical_concept: str, proposition_text: str) -> set[str]:
    generic_verbs = {
        'sử', 'dụng', 'dùng', 'bị', 'có', 'tiền', 'sử', 'tình', 'trạng',
        'khai', 'ghi', 'nhận', 'cảm', 'thấy', 'nghi', 'ngờ', 'đang', 'hiện',
        'mức', 'độ', 'loại', 'nguy', 'cơ', 'nghiệm', 'pháp', 'kết', 'quả'
    }
    raw_text = f'{canonical_concept} {proposition_text}'
    tokens = set()
    for word in re.findall(r'\w+', raw_text.casefold()):
        if len(word) >= 2 and word not in generic_verbs:
            tokens.add(word)
    return tokens

def check_negation(soap_text: str, cap_id: str, concept: str, prop: str, status: str):
    neg_kws = ['không', 'chưa', 'âm tính', 'âm', 'không có']
    norm_soap = _normalize_text(soap_text)
    is_cap_negated = status == 'negated' or any(kw in _normalize_text(prop) for kw in neg_kws)
    core_tokens = _extract_core_concept_tokens(concept, prop)

    clauses = [c.strip() for c in re.split(r'[;.,\n]|(?:\b(?:và|hoặc|nhưng|đồng thời)\b)', norm_soap) if c.strip()]
    
    if is_cap_negated:
        # Check if any matching clause or item contains negation for this concept
        matching_clauses = [c for c in clauses if any(t in c for t in core_tokens)]
        if not matching_clauses:
            matching_clauses = [norm_soap]
        has_neg = any(any(kw in c for kw in neg_kws) for c in matching_clauses)
        if not has_neg:
            return f'Violation: CAP {cap_id} is negated, but SOAP asserts affirmation'
    else:
        # CAP is affirmed: check if any clause mentioning core concept contains negation
        matching_clauses = [c for c in clauses if any(t in c for t in core_tokens)]
        for c in matching_clauses:
            if any(kw in c for kw in neg_kws):
                return f'Violation: CAP {cap_id} is affirmed, but SOAP asserts negation in clause: "{c}"'
    return 'PASS'

s6_text = 'Hút nửa bao thuốc lá mỗi ngày và uống khoảng 3–4 lon bia mỗi tuần; không sử dụng chất kích thích hoặc ma túy.'
print('C12 (smoke, affirmed):', check_negation(s6_text, 'C12', 'hút thuốc lá', 'Hút nửa bao thuốc lá mỗi ngày', 'affirmed'))
print('C13 (beer, affirmed):', check_negation(s6_text, 'C13', 'sử dụng rượu bia', 'Uống khoảng 3 đến 4 lon bia mỗi tuần', 'affirmed'))
print('C14 (drugs, negated):', check_negation(s6_text, 'C14', 'sử dụng chất kích thích hoặc ma túy', 'Không sử dụng chất kích thích hoặc ma túy để giải trí', 'negated'))

bad_s6_text = 'Không uống rượu bia; không dùng chất kích thích.'
print('\nContradiction C13 (beer affirmed vs soap negated):', check_negation(bad_s6_text, 'C13', 'sử dụng rượu bia', 'Uống khoảng 3 đến 4 lon bia mỗi tuần', 'affirmed'))
