# CORS allow-list and refresh-cookie attributes. CI sets CORS_ORIGINS=https://mycommuniti.org,https://*.mycommuniti.org
import urllib.request, urllib.error

def raw(method, path, headers=None, body=None):
    r = urllib.request.Request(B + path, method=method, headers=headers or {}, data=body)
    try:
        with urllib.request.urlopen(r) as res: return res.status, res.headers
    except urllib.error.HTTPError as e: return e.code, e.headers

def preflight(origin):
    return raw('OPTIONS', '/auth/login', {'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-client'})

for origin in ['https://app.mycommuniti.org', 'https://admin.mycommuniti.org', 'https://mycommuniti.org', 'https://staging.app.mycommuniti.org', 'http://localhost:5173']:
    code, h = preflight(origin)
    check(code == 204 and h.get('access-control-allow-origin') == origin and h.get('access-control-allow-credentials') == 'true'
          and 'authorization' in (h.get('access-control-allow-headers') or '').lower(), f'CORS allows {origin}')

for origin in ['https://evilmycommuniti.org', 'https://mycommuniti.org.evil.com', 'http://app.mycommuniti.org', 'https://app.mycommuniti.org:8443', 'https://evil.com', 'null']:
    code, h = preflight(origin)
    check(h.get('access-control-allow-origin') is None, f'CORS blocks {origin}')

code, h = raw('GET', '/health')  # no Origin header: mobile apps and servers are unaffected by CORS
check(code == 200, 'request without Origin (mobile/server) works')

import json
def web_login(origin):
    E = f'cors-{abs(hash(origin)) % 10**8}@example.com'
    call('POST', '/auth/register', body={'fullName': 'Cors Tester', 'email': E, 'password': 'Secret123', 'acceptTerms': True}, expect=201)
    call('POST', '/auth/verify-email', body={'email': E, 'code': code_from_log()})
    _, h = raw('POST', '/auth/login', {'Origin': origin, 'content-type': 'application/json', 'x-client': 'web', 'x-forwarded-for': '10.200.0.1'},
               json.dumps({'email': E, 'password': 'Secret123'}).encode())
    return h.get('set-cookie') or ''

c = web_login('https://app.mycommuniti.org')
check('communiti_rt=' in c and 'SameSite=Lax' in c and 'HttpOnly' in c and 'Path=/api/v1/auth' in c and 'Domain=' not in c,
      'same-site frontend gets a host-only, HttpOnly, SameSite=Lax refresh cookie')
c = web_login('https://preview-123.vercel.app')
check('SameSite=None' in c and 'Secure' in c, 'cross-site frontend gets SameSite=None; Secure refresh cookie')
