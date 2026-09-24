"""Shared helpers for the end-to-end suite. Configured by environment variables:
API_URL (default http://localhost:4000), API_LOG (server log file, where OTP codes are logged
when SMTP is not configured), DATABASE_URL (used to insert ready media rows directly)."""
import itertools, json, os, re, subprocess, threading, time, urllib.error, urllib.request, uuid

B = os.environ.get('API_URL', 'http://localhost:4000').rstrip('/') + '/api/v1'
API_LOG = os.environ.get('API_LOG', '/tmp/api.log')
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/communiti')
FAILS = []
PASSES = [0]
_ip = itertools.count(1)

def call(m, path, tok=None, body=None, client='ios', expect=None):
    # A unique X-Forwarded-For per call keeps per-IP rate limits out of the way (trustProxy is on).
    n = next(_ip)
    h = {'content-type': 'application/json', 'x-client': client, 'x-forwarded-for': f'10.{n // 65536 % 256}.{n // 256 % 256}.{n % 256}', 'user-agent': 'e2e'}
    if tok: h['authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(B + path, method=m, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as res: code, txt = res.status, res.read().decode()
    except urllib.error.HTTPError as e: code, txt = e.code, e.read().decode()
    d = json.loads(txt) if txt else None
    ok = (expect is None and code < 400) or code == expect
    line = f"{m:6} {path.split('?')[0]:60} {code}"
    if ok: PASSES[0] += 1; print('PASS', line)
    else: FAILS.append(line); print('FAIL', line, ' expected', expect or '<400', ' ', txt[:300])
    return d

def check(cond, label):
    if cond: PASSES[0] += 1; print('PASS', label)
    else: FAILS.append(label); print('FAIL', label)

def code_from_log():
    for _ in range(20):
        time.sleep(0.15)
        codes = re.findall(r'"code":"(\d{6})"', open(API_LOG).read())
        if codes: return codes[-1]
    raise RuntimeError(f'No OTP code found in {API_LOG} (is SMTP_PASS empty?)')

def signup(name, email, password='Secret123'):
    call('POST', '/auth/register', body={'fullName': name, 'email': email, 'password': password, 'acceptTerms': True}, expect=201)
    d = call('POST', '/auth/verify-email', body={'email': email, 'code': code_from_log()})
    return d['accessToken'], d['user']['id']

def psql(q):
    return subprocess.run(['psql', DATABASE_URL, '-tAc', q], capture_output=True, text=True, check=True).stdout.strip()

def media(owner, kind='image', mime='image/jpeg', vis='public'):
    """Inserts a ready upload directly (Supabase Storage is not available in CI)."""
    mid = str(uuid.uuid4())
    psql(f"insert into media (id,owner_id,kind,visibility,storage_path,mime_type,size_bytes,status) values ('{mid}','{owner}','{kind}','{vis}','t/{mid}','{mime}',1000,'ready')")
    return mid
