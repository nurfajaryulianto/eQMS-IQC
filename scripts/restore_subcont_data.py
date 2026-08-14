import urllib.request
import csv
import io
import json
from datetime import datetime

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
    # Try YYYY-MM-DD
    if len(d_str) >= 10 and d_str[4] == '-' and d_str[7] == '-':
        return d_str[:10]
    # Try DD/MM/YYYY or MM/DD/YYYY
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
    try:
        dt = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
        return dt.isoformat() + "Z"
    except Exception:
        pass
    d = parse_date(ts_str)
    return (d + "T00:00:00Z") if d else datetime.utcnow().isoformat() + "Z"

def parse_int(val):
    try:
        v = str(val).replace(',', '').strip()
        return int(float(v)) if v else 0
    except Exception:
        return 0

def parse_float(val):
    try:
        v = str(val).replace(',', '').replace('%', '').strip()
        return float(v) if v else 0.0
    except Exception:
        return 0.0

def supabase_post(endpoint, rows, on_conflict=None):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation" if on_conflict else "return=representation"
    }

    BATCH_SIZE = 100
    total_saved = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        data_json = json.dumps(batch).encode('utf-8')
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

    session_rows = []
    seen_sessions = set()

    for r in sessions_csv:
        sess_id = (r.get('SessionID') or r.get('SessionId') or '').strip()
        if not sess_id or sess_id in seen_sessions:
            continue
        seen_sessions.add(sess_id)

        qty_in = parse_int(r.get('Qty Incoming'))
        qty_insp = parse_int(r.get('Qty Inspect'))
        qty_pass = parse_int(r.get('Qty Pass'))
        qty_def = parse_int(r.get('Qty Defect'))
        ftt = (qty_pass / qty_insp) if qty_insp > 0 else 0.0
        redo_rate = (qty_def / qty_insp) if qty_insp > 0 else 0.0

        ts = parse_timestamp(r.get('timeStamp'))
        date_inc = parse_date(r.get('Date'))
        tgl_insp = parse_date(r.get('TanggalInspection') or r.get('TanggalInsp') or r.get('Date'))
        bucket = parse_date(r.get('Bucket'))

        session_rows.append({
            "session_id": sess_id,
            "timestamp": ts,
            "date": date_inc,
            "tanggal_insp": tgl_insp,
            "bucket": bucket,
            "material_type": (r.get('Material Type') or '').strip(),
            "user_login": (r.get('User Login') or '').strip(),
            "vendor": (r.get('Vendor') or '').strip(),
            "component": (r.get('Component') or '').strip(),
            "process": (r.get('Process') or '').strip(),
            "style_number": (r.get('Style Number') or '').strip(),
            "model": (r.get('Model') or '').strip(),
            "qty_incoming": qty_in,
            "qty_inspect": qty_insp,
            "qty_pass": qty_pass,
            "qty_defect": qty_def,
            "ftt": round(ftt, 4),
            "redo_rate": round(redo_rate, 4),
            "approved_by": (r.get('ApprovedByLeader') or r.get('ApprovedBy') or '').strip(),
            "evidence_url": (r.get('EvidenceUrl') or '').strip(),
            "status": (r.get('Status') or 'Done').strip(),
            "updated_at": ts
        })

    print(f"Prepared {len(session_rows)} unique session records to upsert into 'subcont_inspections'.")
    saved_sessions = supabase_post("subcont_inspections", session_rows, on_conflict="session_id")
    print(f"-> Successfully saved {saved_sessions} sessions into 'subcont_inspections'.\n")

    print("=== 2. FETCHING DEFECTS DATA (GID=1201077179) ===")
    defects_csv = fetch_csv(1201077179)
    print(f"Total raw defect rows in spreadsheet: {len(defects_csv)}")

    # Clear existing defect logs and restore clean set
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "return=minimal"
    }
    req_del = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/subcont_defect_logs?id=gt.0", headers=headers, method='DELETE')
    try:
        with urllib.request.urlopen(req_del, timeout=10) as resp:
            print("Cleared existing rows in 'subcont_defect_logs' for clean restoration.")
    except Exception as e:
        print(f"Notice on clearing defect logs: {e}")

    defect_rows = []
    for r in defects_csv:
        sess_id = (r.get('SessionId') or r.get('SessionID') or '').strip()
        if not sess_id or sess_id not in seen_sessions:
            continue
        
        cnt = parse_int(r.get('Count'))
        if cnt <= 0:
            continue

        defect_rows.append({
            "session_id": sess_id,
            "date": parse_date(r.get('Date')),
            "vendor": (r.get('Vendor') or '').strip(),
            "component": (r.get('Component') or '').strip(),
            "issue_finding": (r.get('Issue Findings') or r.get('Issue Finding') or r.get('DefectType') or '').strip(),
            "count": cnt
        })

    print(f"Prepared {len(defect_rows)} defect detail records to insert into 'subcont_defect_logs'.")
    saved_defects = supabase_post("subcont_defect_logs", defect_rows)
    print(f"-> Successfully saved {saved_defects} defect rows into 'subcont_defect_logs'.\n")

    print("=== RESTORATION COMPLETE ===")
    print(f"Summary: {saved_sessions} inspections & {saved_defects} defect details restored into Supabase.")

if __name__ == "__main__":
    main()
