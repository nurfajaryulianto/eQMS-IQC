import urllib.request
import csv
import io
import json
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = "https://mymzszufrwmpkpmmlnnc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bXpzenVmcndtcGtwbW1sbm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzgwODksImV4cCI6MjA5Mjg1NDA4OX0.gGu3xJ0yjUmLncz277gGSP8qiV8TiBrlJvg3C-t6ZJw"
SPREADSHEET_ID = "1KLVddUlNGySE149gH9UD33DOjJMMCzcKHkvB0gZnqIc"

def fetch_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={gid}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode('utf-8')
    return list(csv.DictReader(io.StringIO(content)))

def parse_date(d_str):
    if not d_str or d_str.strip() == '' or d_str == 'null':
        return None
    d_str = d_str.strip()
    if 'T' in d_str:
        return d_str.split('T')[0]
    if len(d_str) >= 10 and d_str[4] == '-' and d_str[7] == '-':
        return d_str[:10]
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(d_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return d_str[:10] if len(d_str) >= 10 else None

def parse_timestamp(ts_str):
    if not ts_str or ts_str.strip() == '':
        return datetime.utcnow().isoformat() + "Z"
    ts_str = ts_str.strip()
    if 'T' in ts_str:
        return ts_str
    d = parse_date(ts_str)
    if d:
        return f"{d}T00:00:00Z"
    return datetime.utcnow().isoformat() + "Z"

def parse_int(val):
    if not val:
        return 0
    clean = str(val).replace(',', '').replace('.', '').strip()
    try:
        return int(clean)
    except ValueError:
        try:
            return int(float(str(val).replace(',', '').strip()))
        except ValueError:
            return 0

def supabase_post(endpoint, data_list, on_conflict=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation" if on_conflict else "return=representation"
    }
    
    BATCH_SIZE = 100
    total_saved = 0
    for i in range(0, len(data_list), BATCH_SIZE):
        batch = data_list[i:i + BATCH_SIZE]
        data_json = json.dumps(batch).encode('utf-8')
        url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
        if on_conflict:
            url += f"?on_conflict={on_conflict}"
        
        req = urllib.request.Request(url, data=data_json, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                total_saved += len(res_data) if isinstance(res_data, list) else len(batch)
                print(f"[{endpoint}] Batch {i//BATCH_SIZE + 1}: {len(batch)} rows processed successfully.")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print(f"[{endpoint}] Error in batch {i//BATCH_SIZE + 1}: {e.code} - {err_body}")
            raise Exception(f"Supabase error: {err_body}")
    return total_saved

def main():
    print("=== 1. FETCHING SESSIONS DATA (GID=0) ===")
    sessions_csv = fetch_csv(0)
    print(f"Total raw session rows in spreadsheet: {len(sessions_csv)}")

    # Clear existing subcont_defect_logs & subcont_inspections to ensure clean state
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "return=minimal"
    }
    try:
        req_del_def = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/subcont_defect_logs?id=gt.0", headers=headers, method='DELETE')
        with urllib.request.urlopen(req_del_def, timeout=15) as resp:
            print("Cleared previous subcont_defect_logs.")
    except Exception as e:
        print("Note on clear subcont_defect_logs:", e)

    try:
        req_del_sess = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/subcont_inspections?session_id=neq.NULL_PLACEHOLDER", headers=headers, method='DELETE')
        with urllib.request.urlopen(req_del_sess, timeout=15) as resp:
            print("Cleared previous subcont_inspections.")
    except Exception as e:
        print("Note on clear subcont_inspections:", e)

    # Process each row as an individual component & process record
    session_id_tracker = defaultdict(int)
    session_rows = []
    valid_session_ids = set()
    
    for idx, r in enumerate(sessions_csv):
        raw_sid = (r.get('SessionID') or r.get('SessionId') or '').strip()
        comp = (r.get('Component') or '').strip()
        model = (r.get('Model') or '').strip()
        
        # Skip completely empty rows
        if not raw_sid and not comp and not model:
            continue

        if not raw_sid:
            raw_sid = f"ROW-{idx+1}"

        session_id_tracker[raw_sid] += 1
        count = session_id_tracker[raw_sid]
        
        if count > 1 and not (raw_sid.endswith('-1') or raw_sid.endswith('-2') or raw_sid.endswith('-3') or raw_sid.endswith('-4') or raw_sid.endswith('-5') or raw_sid.endswith('-6') or raw_sid.endswith('-7')):
            sid = f"{raw_sid}-{count}"
        else:
            sid = raw_sid

        valid_session_ids.add(sid)
        valid_session_ids.add(raw_sid)

        q_in = parse_int(r.get('Qty Incoming'))
        q_insp = parse_int(r.get('Qty Inspect'))
        q_pass = parse_int(r.get('Qty Pass'))
        q_def = parse_int(r.get('Qty Defect'))

        ftt = (q_pass / q_insp) if q_insp > 0 else 0.0
        redo_rate = (q_def / q_insp) if q_insp > 0 else 0.0

        ts = parse_timestamp(r.get('timeStamp'))
        date_inc = parse_date(r.get('Date'))
        tgl_insp = parse_date(r.get('TanggalInspection') or r.get('TanggalInsp') or r.get('Date'))
        bucket = parse_date(r.get('Bucket'))

        session_rows.append({
            "session_id": sid,
            "timestamp": ts,
            "date": date_inc,
            "tanggal_insp": tgl_insp,
            "bucket": bucket,
            "material_type": (r.get('Material Type') or '').strip(),
            "user_login": (r.get('User Login') or '').strip(),
            "vendor": (r.get('Vendor') or '').strip(),
            "component": comp,
            "process": (r.get('Process') or '').strip(),
            "style_number": (r.get('Style Number') or '').strip(),
            "model": model,
            "qty_incoming": q_in,
            "qty_inspect": q_insp,
            "qty_pass": q_pass,
            "qty_defect": q_def,
            "ftt": round(ftt, 4),
            "redo_rate": round(redo_rate, 4),
            "approved_by": (r.get('ApprovedByLeader') or r.get('ApprovedBy') or '').strip(),
            "evidence_url": (r.get('EvidenceUrl') or '').strip(),
            "status": (r.get('Status') or 'Done').strip(),
            "updated_at": ts
        })

    print(f"Prepared {len(session_rows)} per-component session records to insert into 'subcont_inspections'.")
    saved_sessions = supabase_post("subcont_inspections", session_rows, on_conflict="session_id")
    print(f"-> Successfully saved {saved_sessions} component records into 'subcont_inspections'.\n")

    print("=== 2. FETCHING DEFECTS DATA (GID=1201077179) ===")
    defects_csv = fetch_csv(1201077179)
    print(f"Total raw defect rows in spreadsheet: {len(defects_csv)}")

    defect_rows = []
    inserted_sids = set(s['session_id'] for s in session_rows)

    for r in defects_csv:
        sess_id = (r.get('SessionId') or r.get('SessionID') or '').strip()
        if not sess_id or sess_id not in inserted_sids:
            continue
        
        d_date = parse_date(r.get('Date'))
        vendor = (r.get('Vendor') or '').strip()
        comp = (r.get('Component') or '').strip()
        finding = (r.get('Issue Findings') or r.get('Issue Finding') or r.get('Defect') or '').strip()
        count = parse_int(r.get('Count') or r.get('Qty'))

        if count <= 0 or not finding:
            continue

        defect_rows.append({
            "session_id": sess_id,
            "date": d_date,
            "vendor": vendor,
            "component": comp,
            "issue_finding": finding,
            "count": count
        })

    print(f"Prepared {len(defect_rows)} defect records to insert into 'subcont_defect_logs'.")
    saved_defects = supabase_post("subcont_defect_logs", defect_rows)
    print(f"-> Successfully saved {saved_defects} defect records into 'subcont_defect_logs'.\n")

    print("=== SYNC AND DATA RESTORATION COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
