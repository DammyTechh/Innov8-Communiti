# Admin dashboard (Overview, Users, Forums, Projects, Events, Highlights, Notifications, Logs, Settings).
# Runs last in the shared namespace (see run.py); creates its own users so it does not depend on earlier state.
import datetime as dt

def iso(days=0, hours=0):
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days, hours=hours)).isoformat(timespec='seconds')

adm = call('POST', '/auth/admin/login', body={'email': 'admin@communiti.app', 'password': 'Admin12345'}, client='admin')['accessToken']
T = [t['id'] for t in call('GET', '/topics')['data']]
own, own_id = signup('Kemi Owner', 'kemi.owner@example.com')
mem, mem_id = signup('Musa Member', 'musa.member@example.com')
rep, rep_id = signup('Ruth Reporter', 'ruth.reporter@example.com')
for tok, role in [(own, 'innovator'), (mem, 'expert'), (rep, 'student')]:
    call('PATCH', '/me/onboarding', tok, {'memberRole': role, 'dateOfBirth': '1994-02-01', 'country': 'NG', 'topicIds': T[:2]})

# ── Profile fields (admin Settings → Profile, user details panel) ─────────────
me = call('PATCH', '/me', mem, {'location': 'Lugbe, Abuja, Nigeria', 'phone': '+234 803 000 0000'})
call('PUT', '/me/role', mem, {'memberRole': 'researcher', 'details': {'institutionalEmail': 'musa@uni.edu.ng', 'researchProjectLink': 'https://research.uni.edu.ng/musa', 'researchEvidence': 'Paper on solar irrigation'}})
check(me['location'] == 'Lugbe, Abuja, Nigeria' and me['phone'] == '+234 803 000 0000', 'PATCH /me saves location and phone')
call('PATCH', '/me', mem, {'phone': 'call me'}, expect=400)

# ── Content to moderate ─────────────────────────────────────────────────────
f = call('POST', '/forums', own, {'name': 'Agritech Hub Forum', 'about': 'Farming tech', 'topicIds': T[:2]}, expect=201)
call('POST', f"/forums/{f['id']}/join", mem)
fpost = call('POST', '/posts', mem, {'body': 'Spam spam buy now', 'forumId': f['id'], 'audience': 'forum'}, expect=201)
pr = call('POST', '/projects', own, {'title': 'Agricultural drone', 'pitch': 'Drones for smallholder farms', 'topicIds': T[:1]}, expect=201)

r_forum = call('POST', '/reports', rep, {'targetType': 'forum', 'targetId': f['id'], 'reason': 'scam'}, expect=201)
r_proj = call('POST', '/reports', rep, {'targetType': 'project', 'targetId': pr['id'], 'reason': 'scam'}, expect=201)
r_post = call('POST', '/reports', rep, {'targetType': 'post', 'targetId': fpost['id'], 'reason': 'spam'}, expect=201)
r_user = call('POST', '/reports', rep, {'targetType': 'user', 'targetId': mem_id, 'reason': 'harassment'}, expect=201)

# ── Dashboard stats ─────────────────────────────────────────────────────────
ov = call('GET', '/admin/stats/overview?range=7d', adm)
check(set(ov['cards']) == {'totalUsers', 'activeEvents', 'activeForums', 'activeProjects'} and ov['cards']['activeForums']['value'] >= 1, 'overview cards with activeForums')
check('changePct' in ov['cards']['totalUsers'] and 'totalUsers' in ov, 'overview keeps legacy fields and adds changePct')
act = call('GET', '/admin/stats/user-activity?range=90d', adm)
check(len(act['data']) == 90 and 'forumPosts' in act['data'][0], 'user-activity 90d with forum series')
su = call('GET', '/admin/stats/users?range=30d', adm)
check(su['new']['value'] >= 3 and 'blocked' in su and 'totals' in su, 'users KPI cards')
sf = call('GET', '/admin/stats/forums', adm)
check(sf['total']['value'] >= 1 and sf['active']['value'] >= 1, 'forums KPI cards')
sp = call('GET', '/admin/stats/projects', adm)
check(sp['new']['value'] >= 1 and abs(sum(v['pct'] for v in sp['distribution'].values()) - 100) < 0.5, 'projects KPIs and distribution adds to 100%')
call('GET', '/admin/stats/events?range=12m', adm)
call('GET', '/admin/stats/forums?range=1y', adm, expect=400)

# ── Moderation queue ────────────────────────────────────────────────────────
qa = call('GET', '/admin/reports?status=all&targetType=forum', adm)
check(any(x['id'] == r_forum['id'] for x in qa['data']) and all(x['targetType'] == 'forum' for x in qa['data']), 'forum queue filter')
check(qa['data'][0]['number'] > 0 and qa['data'][0]['targetName'] == 'Agritech Hub Forum', 'report number and targetName')
qs = call('GET', '/admin/reports?status=all&q=Agricultural', adm)
check(any(x['id'] == r_proj['id'] for x in qs['data']), 'search reports by project title')
qn = call('GET', f"/admin/reports?status=all&q={qa['data'][0]['number']}", adm)
check(qn['total'] >= 1, 'search reports by number')
qu = call('GET', '/admin/reports?status=all&targetType=user,post,comment', adm)
check({x['targetType'] for x in qu['data']} <= {'user', 'post', 'comment'} and qu['total'] >= 2, 'users-page queue (multi targetType)')
call('GET', '/admin/reports?targetType=planet', adm, expect=400)

d = call('GET', f"/admin/reports/{r_forum['id']}", adm)
check(d['content']['title'] == 'Agritech Hub Forum' and d['content']['memberCount'] == 2 and len(d['content']['members']) == 2 and len(d['content']['topics']) == 2, 'forum report panel content')
check(d['history']['accountStatus'] == 'active' and d['reportsCount'] == 1, 'forum report history')
dp = call('GET', f"/admin/reports/{r_post['id']}", adm)
check(dp['content']['body'] == 'Spam spam buy now' and dp['content']['author']['id'] == mem_id, 'post report panel content')

# Send warning on the forum itself
w = call('POST', f"/admin/reports/{r_forum['id']}/action", adm, {'action': 'warn', 'note': 'Scam links'})
check(w['outcome'] == 'warned' and w['content']['status'] == 'flagged', 'forum warned via report')
fl = call('GET', '/admin/forums?status=flagged', adm)
check(any(x['id'] == f['id'] and x['reportCount'] == 1 and len(x['shortId']) == 8 for x in fl['data']), 'forums table: flagged, reportCount, shortId')
call('POST', f"/admin/reports/{r_forum['id']}/action", adm, {'action': 'dismiss'}, expect=409)

# Restrict: no new members or posts
call('POST', f"/admin/forums/{f['id']}/status", adm, {'action': 'restrict', 'reason': 'Cooling off', 'durationDays': 3})
call('POST', f"/forums/{f['id']}/join", rep, expect=403)
call('POST', '/posts', mem, {'body': 'still here', 'forumId': f['id'], 'audience': 'forum'}, expect=403)
call('POST', f"/admin/forums/{f['id']}/status", adm, {'action': 'reinstate'})
call('POST', f"/forums/{f['id']}/join", rep)

# Suspend project via its report: hidden from members until reinstated
sp_ = call('POST', f"/admin/reports/{r_proj['id']}/action", adm, {'action': 'suspend', 'note': 'Investigating', 'durationDays': 7})
check(sp_['outcome'] == 'suspended' and sp_['content']['status'] == 'suspended', 'project suspended via report')
call('GET', f"/projects/{pr['id']}", rep, expect=404)
check(call('GET', '/admin/projects?status=suspended', adm)['total'] >= 1, 'projects table status filter')
call('POST', f"/admin/projects/{pr['id']}/status", adm, {'action': 'reinstate'})
call('GET', f"/projects/{pr['id']}", rep)
call('POST', f"/projects/{pr['id']}/join-requests", rep, {}, expect=201)
call('POST', f"/admin/projects/{pr['id']}/status", adm, {'action': 'restrict'})
call('POST', f"/projects/{pr['id']}/join-requests", mem, {}, expect=403)
call('POST', f"/admin/projects/{pr['id']}/status", adm, {'action': 'reinstate'})

# Delete forum (remove_content) then restore it
f2 = call('POST', '/forums', own, {'name': 'Crypto bros'}, expect=201)
r_f2 = call('POST', '/reports', rep, {'targetType': 'forum', 'targetId': f2['id'], 'reason': 'scam'}, expect=201)
call('POST', f"/admin/reports/{r_f2['id']}/action", adm, {'action': 'remove_content', 'note': 'Ponzi scheme'})
call('GET', f"/forums/{f2['id']}", rep, expect=404)
check(any(x['id'] == f2['id'] for x in call('GET', '/admin/forums?status=removed', adm)['data']), 'deleted forum listed as removed')
call('POST', f"/admin/content/forum/{f2['id']}/restore", adm, {}, expect=204)
call('GET', f"/forums/{f2['id']}", rep)

# Post report: remove content and warn the author
pw = call('POST', f"/admin/reports/{r_post['id']}/action", adm, {'action': 'warn', 'removeContent': True, 'note': 'Spam'})
check(pw['outcome'] == 'warned' and pw['content']['removed'], 'post removed and author warned')

# ── Users ───────────────────────────────────────────────────────────────────
ul = call('GET', '/admin/users?q=musa', adm)
sid = ul['data'][0]['shortId']
check(len(sid) == 8 and call('GET', f'/admin/users?q={sid}', adm)['total'] == 1, 'search users by short id')
check(call('GET', '/admin/users?memberRole=expert', adm)['total'] >= 1, 'filter users by memberRole')
ud = call('GET', f'/admin/users/{mem_id}', adm)

check(ud['location'] == 'Lugbe, Abuja, Nigeria' and ud['institutionalEmail'] == 'musa@uni.edu.ng' and ud['reportHistory']['previousReports'] >= 2 and ud['reportHistory']['previousWarnings'] == 1, 'user details panel')

# Change email → account logs show it
call('POST', '/me/email', mem, {'newEmail': 'kemi.owner@example.com', 'password': 'Secret123'}, expect=409)
call('POST', '/me/email', mem, {'newEmail': 'musa.new@example.com', 'password': 'wrong-pass1'}, expect=400)
call('POST', '/me/email', mem, {'newEmail': 'musa.new@example.com', 'password': 'Secret123'}, expect=202)
call('POST', '/me/email/verify', rep, {'newEmail': 'musa.new@example.com', 'code': code_from_log()}, expect=400)  # not your code
call('POST', '/me/email', mem, {'newEmail': 'musa.new2@example.com', 'password': 'Secret123'}, expect=202)
ch = call('POST', '/me/email/verify', mem, {'newEmail': 'musa.new2@example.com', 'code': code_from_log()})
check(ch['email'] == 'musa.new2@example.com', 'email changed')
mem = call('POST', '/auth/login', body={'email': 'musa.new2@example.com', 'password': 'Secret123'})['accessToken']
call('POST', '/auth/logout', mem, expect=204)
mem = call('POST', '/auth/login', body={'email': 'musa.new2@example.com', 'password': 'Secret123'})['accessToken']
logs = call('GET', f'/admin/users/{mem_id}/logs', adm)
labels = [x['label'] for x in logs['data']]
check('Changed email' in labels and 'Logged in' in labels and 'Logged out' in labels and 'User warned' in labels, 'account logs labels')
check(any(x['details'] == 'changed email to musa.new2@example.com' for x in logs['data']), 'account log details')
today = dt.date.today().isoformat()
check(call('GET', f'/admin/users/{mem_id}/logs?from={today}&to={today}', adm)['total'] == logs['total'], 'account logs date filter (today)')
check(call('GET', f'/admin/users/{mem_id}/logs?to=2020-01-01', adm)['total'] == 0, 'account logs date filter (past)')

# Block from the user report (admins only) → outcome blocked
bu = call('POST', f"/admin/reports/{r_user['id']}/action", adm, {'action': 'block', 'note': 'Repeated harassment'})
check(bu['outcome'] == 'blocked' and bu['history']['accountStatus'] == 'blocked', 'user blocked via report')
call('GET', '/me', mem, expect=401)  # blocking ends every session
check(call('GET', '/admin/stats/users?range=7d', adm)['blocked']['value'] >= 1, 'blocked KPI counts the block')

# ── Events ──────────────────────────────────────────────────────────────────
ev_body = {'title': 'Innovate Challenge 2026', 'category': 'bootcamp', 'startsAt': iso(10), 'endsAt': iso(14), 'venue': 'Innovation Hub, Lugbe, Abuja',
           'registrationUrl': 'https://example.com/innovate', 'description': '48-hour hackathon', 'organizerName': 'Innovation Hub', 'organizerTagline': 'Creative Media', 'status': 'published'}
ev = call('POST', '/admin/events', adm, ev_body, expect=201)
check(ev['organizerName'] == 'Innovation Hub' and ev['category'] == 'bootcamp', 'event organizer and new category')
call('POST', '/admin/events', adm, {k: v for k, v in ev_body.items() if k != 'registrationUrl'}, expect=400)
past = call('POST', '/admin/events', adm, {**ev_body, 'title': 'Tetfair 2025', 'category': 'networking_fair', 'startsAt': iso(-40), 'endsAt': iso(-39)}, expect=201)
check(any(x['id'] == ev['id'] for x in call('GET', '/admin/events?when=upcoming', adm)['data']), 'upcoming events')
check(any(x['id'] == past['id'] for x in call('GET', '/admin/events?when=concluded&q=tetfair', adm)['data']), 'concluded events search')
call('GET', f"/admin/events/{ev['id']}", adm)
check(call('GET', f"/events/{ev['id']}", rep)['organizerTagline'] == 'Creative Media', 'members see organizer')
se = call('GET', '/admin/stats/events?range=7d', adm)
check(se['upcoming']['value'] >= 1 and se['concluded']['value'] >= 1, 'events KPI cards')

# ── Highlights linked to a past event ─────────────────────────────────────────
m1, m2 = media(psql("select id from users where email='admin@communiti.app'")), media(psql("select id from users where email='admin@communiti.app'"))
h = call('POST', '/admin/highlights', adm, {'eventId': past['id'], 'mediaIds': [m1]}, expect=201)
check(h['title'] == 'Tetfair 2025' and h['event']['id'] == past['id'], 'highlight takes the event title')
call('POST', '/admin/highlights', adm, {'mediaIds': [m1]}, expect=400)  # needs a title or an event
h = call('PATCH', f"/admin/highlights/{h['id']}", adm, {'mediaIds': [m2, m1]})
check([x['id'] for x in h['media']] == [m2, m1], 'highlight images replaced in order')
check(call('GET', f"/admin/highlights?eventId={past['id']}", adm)['total'] == 1 and call('GET', '/admin/highlights?q=tetfair', adm)['total'] == 1, 'highlight filters')
call('GET', f"/admin/highlights/{h['id']}", adm)

# ── Notifications: email broadcasts ─────────────────────────────────────────
call('PATCH', '/me/settings', rep, {'notificationPrefs': {'broadcast': {'inApp': True, 'push': True, 'email': False}}})
b = call('POST', '/admin/broadcasts', adm, {'title': 'Forum update', 'body': 'New rules', 'audience': {'platform': 'forums', 'ids': [f['id']]}}, expect=201)
# forum members: owner, musa (blocked → skipped), ruth (opted out of broadcast email) → 1 recipient
check(b['channels'] == {'email': True, 'inApp': False} and b['recipientCount'] == 1 and b['status'] == 'sent' and b['deliveredCount'] == 1, 'email broadcast to forum members')
bu2 = call('POST', '/admin/broadcasts', adm, {'title': 'Hello Kemi', 'body': 'Just you', 'audience': {'platform': 'users', 'ids': [own_id]}, 'channels': {'email': True, 'inApp': True}}, expect=201)
check(bu2['recipientCount'] == 1, 'broadcast to a specific user id')
check(any(n['title'] == 'Hello Kemi' for n in call('GET', '/notifications', own)['data']), 'optional in-app copy')
call('POST', '/admin/broadcasts', adm, {'title': 'Nothing', 'body': 'x', 'channels': {'email': False, 'inApp': False}}, expect=400)
call('GET', f"/admin/broadcasts/{b['id']}", adm)
call('POST', f"/admin/broadcasts/{b['id']}/resume", adm)
check(call('GET', '/admin/broadcasts?kind=announcement', adm)['total'] >= 2, 'broadcast history')

# ── Settings: image optimization + maintenance ─────────────────────────────
s = call('PATCH', '/admin/settings', adm, {'imageOptimization': False})
check(s['imageOptimization'] is False and call('GET', '/app-config')['imageOptimization'] is False, 'image optimization switch')
call('PATCH', '/admin/settings', adm, {'imageOptimization': True})
call('POST', '/admin/maintenance', adm, {'message': 'x', 'startsAt': iso(1), 'endsAt': iso(-1)}, expect=400)
fut = call('POST', '/admin/maintenance', adm, {'message': 'Database upgrade', 'startsAt': iso(3), 'endsAt': iso(3, 2), 'disableAccess': True}, expect=201)
check(fut['state'] == 'scheduled' and fut['broadcastId'], 'maintenance scheduled and members emailed')
mb = call('GET', f"/admin/broadcasts/{fut['broadcastId']}", adm)
check(mb['kind'] == 'maintenance' and mb['recipientCount'] >= 3, 'maintenance email ignores broadcast opt-out')
call('POST', '/admin/maintenance', adm, {'message': 'Clash', 'startsAt': iso(3, 1), 'endsAt': iso(3, 3)}, expect=409)
now_w = call('POST', '/admin/maintenance', adm, {'message': 'Emergency fix', 'startsAt': iso(0, -1), 'endsAt': iso(0, 1), 'disableAccess': True, 'notifyUsers': False}, expect=201)
cfg = call('GET', '/app-config')
check(cfg['maintenance']['active'] and cfg['maintenance']['id'] == now_w['id'], 'app-config shows active maintenance')
call('GET', '/feed', own, expect=503)
call('GET', '/me', adm)  # staff keep access
call('GET', '/admin/stats/overview', adm)
call('POST', '/auth/login', body={'email': 'kemi.owner@example.com', 'password': 'Secret123'})  # sign-in still works
call('PATCH', f"/admin/maintenance/{now_w['id']}", adm, {'disableAccess': False})
call('GET', '/feed', own)
call('DELETE', f"/admin/maintenance/{now_w['id']}", adm, expect=204)
call('DELETE', f"/admin/maintenance/{fut['id']}", adm, expect=204)
check(call('GET', '/app-config')['maintenance'] is None, 'maintenance cancelled')
check(call('GET', '/admin/maintenance?state=past', adm)['total'] >= 2, 'maintenance history')

# ── Admin logs + staff sign-in notification ──────────────────────────────────
lg = call('GET', '/admin/audit-logs?q=maintenance', adm)
check(lg['total'] >= 3 and all(x['label'] and x['details'] for x in lg['data']), 'logs search with labels')
check(call('GET', f'/admin/audit-logs?from={today}&to={today}', adm)['total'] > 0, 'logs date filter')
psql(f"update users set platform_role='moderator' where id='{own_id}'")
modk = call('POST', '/auth/admin/login', body={'email': 'kemi.owner@example.com', 'password': 'Secret123'}, client='admin')['accessToken']
check(any(n['type'] == 'admin_activity' and 'Kemi Owner' in n['body'] for n in call('GET', '/notifications', adm)['data']), 'admins notified of dashboard sign-in')
call('GET', f'/admin/users/{mem_id}/logs', modk, expect=403)
call('PATCH', '/admin/settings', modk, {'imageOptimization': False}, expect=403)
call('POST', '/admin/maintenance', modk, {'message': 'nope', 'startsAt': iso(5), 'endsAt': iso(6)}, expect=403)
call('POST', f"/admin/forums/{f['id']}/status", modk, {'action': 'warn'})  # moderators can moderate forums
call('POST', '/admin/broadcasts', modk, {'title': 'Nope', 'body': 'x'}, expect=403)
