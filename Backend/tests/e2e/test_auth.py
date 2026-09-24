# Authentication: sign-up, verification, login, sessions, token rotation, password flows, lockout.
E = 'auth-user@example.com'
call('POST', '/auth/register', body={'fullName': 'Auth User', 'email': E, 'password': 'short', 'acceptTerms': True}, expect=400)
call('POST', '/auth/register', body={'fullName': 'Auth User', 'email': E.upper(), 'password': 'Secret123', 'acceptTerms': True}, expect=201)
call('POST', '/auth/verify-email/resend', body={'email': E}, expect=429)            # 60 s cooldown
d = call('POST', '/auth/login', body={'email': E, 'password': 'Secret123'}, expect=403)
check(d['error']['code'] == 'EMAIL_NOT_VERIFIED', 'login before verification -> EMAIL_NOT_VERIFIED')
code = code_from_log()
d = call('POST', '/auth/verify-email', body={'email': E, 'code': '000000' if code != '000000' else '111111'}, expect=400)
check(d['error']['code'] == 'OTP_INVALID', 'wrong code -> OTP_INVALID')
d = call('POST', '/auth/verify-email', body={'email': E, 'code': code}, client='web')
check(d['user']['emailVerified'] and d['refreshToken'] is None, 'web verify: signed in, refresh token only in cookie')
call('POST', '/auth/register', body={'fullName': 'Auth User', 'email': E, 'password': 'Secret123', 'acceptTerms': True}, expect=409)
call('POST', '/auth/login', body={'email': E, 'password': 'Wrong1234'}, expect=401)

d = call('POST', '/auth/login', body={'email': E, 'password': 'Secret123'})
AT, RT = d['accessToken'], d['refreshToken']
check(RT and len(RT) > 20, 'mobile login returns refresh token in body')
s = call('GET', '/auth/sessions', AT)
check(sum(1 for x in s['data'] if x['current']) == 1, 'sessions list marks current device')
d2 = call('POST', '/auth/refresh', body={'refreshToken': RT})
check(d2['refreshToken'] and d2['refreshToken'] != RT, 'refresh rotates the token')
d3 = call('POST', '/auth/refresh', body={'refreshToken': RT})
check(d3['accessToken'] and d3['refreshToken'] is None, 'old token within grace: access only, no new refresh')
call('POST', '/auth/refresh', body={'refreshToken': 'x' * 40}, expect=401)

call('POST', '/auth/password/forgot', body={'email': E}, expect=202)
call('POST', '/auth/password/forgot', body={'email': 'nobody@example.com'}, expect=202)  # no enumeration
rt = call('POST', '/auth/password/verify-code', body={'email': E, 'code': code_from_log()})['resetToken']
call('POST', '/auth/password/reset', body={'resetToken': rt, 'newPassword': 'NewSecret456'}, expect=204)
d = call('POST', '/auth/password/reset', body={'resetToken': rt, 'newPassword': 'Another789'}, expect=400)
check(d['error']['code'] == 'TOKEN_INVALID', 'reset token is single use')
call('GET', '/auth/sessions', AT, expect=401)                                   # reset signs out everywhere
call('POST', '/auth/login', body={'email': E, 'password': 'Secret123'}, expect=401)
AT = call('POST', '/auth/login', body={'email': E, 'password': 'NewSecret456'})['accessToken']
d = call('POST', '/auth/password/change', AT, {'currentPassword': 'nope', 'newPassword': 'Another789'}, expect=400)
check('currentPassword' in d['error']['fields'], 'change password: wrong current password flagged on field')
call('POST', '/auth/password/change', AT, {'currentPassword': 'NewSecret456', 'newPassword': 'Another789'}, expect=204)
check(len(call('GET', '/auth/sessions', AT)['data']) == 1, 'change password keeps this device signed in')
call('POST', '/auth/logout', AT, expect=204)
call('GET', '/auth/sessions', AT, expect=401)
call('POST', '/auth/admin/login', body={'email': E, 'password': 'Another789'}, client='admin', expect=403)
call('GET', '/auth/google', expect=503)                                          # not configured in CI
for _ in range(5):
    call('POST', '/auth/login', body={'email': E, 'password': 'bad12345'}, expect=401)
d = call('POST', '/auth/login', body={'email': E, 'password': 'Another789'}, expect=403)
check(d['error']['code'] == 'ACCOUNT_LOCKED', '5 failed logins lock the account')
