import glob
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

runs = glob.glob('data/soap_mvp/*/')
print(f"Total runs found in data/soap_mvp/: {len(runs)}")

for run_dir in sorted(runs):
    run_id = os.path.basename(os.path.normpath(run_dir))
    transcript_path = os.path.join(run_dir, 'transcript.json')
    caps_path = os.path.join(run_dir, 'caps.json')
    attempts = sorted(glob.glob(os.path.join(run_dir, 'attempts', '*.json')))

    if not os.path.exists(caps_path):
        continue

    with open(caps_path, 'r', encoding='utf-8') as f:
        caps_data = json.load(f)
    caps = caps_data.get('caps', [])

    transcript_turns = []
    if os.path.exists(transcript_path):
        with open(transcript_path, 'r', encoding='utf-8') as f:
            t_data = json.load(f)
            transcript_turns = t_data.get('turns', [])

    usable_caps = [c for c in caps if c.get('resolution_status') == 'current']
    quarantined_caps = [c for c in caps if c.get('resolution_status') == 'needs_review']
    superseded_caps = [c for c in caps if c.get('resolution_status') == 'superseded']

    # Candidate routing
    cand_s = [c['prop_id'] for c in usable_caps if c.get('speaker_source') == 'patient']
    cand_o = [c['prop_id'] for c in usable_caps if c.get('speaker_source') == 'clinician' and c.get('cap_type') in {'ExamFinding', 'TestResult'}]
    cand_a = [c['prop_id'] for c in usable_caps if c.get('speaker_source') == 'clinician' and c.get('cap_type') in {'Problem', 'ProblemHistory'}]
    cand_p = [c['prop_id'] for c in usable_caps if c.get('speaker_source') == 'clinician' and c.get('cap_type') in {'MedicationRequest', 'Order', 'FollowUp', 'Counseling'}]

    last_output = None
    if attempts:
        for att in reversed(attempts):
            with open(att, 'r', encoding='utf-8') as f:
                att_data = json.load(f)
                if 'output' in att_data:
                    last_output = att_data['output']
                    break

    used_cap_ids = set()
    s_used, o_used, a_used, p_used = set(), set(), set(), set()
    if last_output:
        try:
            if isinstance(last_output, str):
                cleaned = last_output.strip()
                if cleaned.startswith("```json"): cleaned = cleaned[7:-3].strip()
                soap_json = json.loads(cleaned)
            else:
                soap_json = last_output

            for item in soap_json.get('S', {}).get('items', []):
                s_used.update(item.get('cap_ids', []))
            for item in soap_json.get('O', {}).get('items', []):
                o_used.update(item.get('cap_ids', []))
            for item in soap_json.get('A', {}).get('items', []):
                a_used.update(item.get('cap_ids', []))
            for item in soap_json.get('P', {}).get('items', []):
                p_used.update(item.get('cap_ids', []))
            used_cap_ids = s_used | o_used | a_used | p_used
        except Exception:
            pass

    print(f"\n--- RUN: {run_id} ---")
    print(f"Turns: {len(transcript_turns)} | Total CAPs: {len(caps)} | Usable: {len(usable_caps)} | Quarantined: {len(quarantined_caps)} | Superseded: {len(superseded_caps)}")
    print(f"Candidates -> S: {len(cand_s)}, O: {len(cand_o)}, A: {len(cand_a)}, P: {len(cand_p)}")
    print(f"Used CAPs -> S: {len(s_used)}/{len(cand_s)}, O: {len(o_used)}/{len(cand_o)}, A: {len(a_used)}/{len(cand_a)}, P: {len(p_used)}/{len(cand_p)}")

    # Highlight missing candidate CAPs
    missing_s = set(cand_s) - s_used
    missing_o = set(cand_o) - o_used
    missing_a = set(cand_a) - a_used
    missing_p = set(cand_p) - p_used
    if missing_s: print(f"  [MISSING IN S]: {missing_s}")
    if missing_o: print(f"  [MISSING IN O]: {missing_o}")
    if missing_a: print(f"  [MISSING IN A]: {missing_a}")
    if missing_p: print(f"  [MISSING IN P]: {missing_p}")
