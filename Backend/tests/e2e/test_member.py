# Member experience: sign-up with location, role onboarding + verification, posts (views, Not interested,
# attachments), comments, blocking, search, trending, collaboration requests, chat, projects, forums, explore.
# Runs last in the shared namespace (see run.py) and creates its own users.

adm = call('POST', '/auth/admin/login', body={'email': 'admin@communiti.app', 'password': 'Admin12345'}, client='admin')['accessToken']
admin_id = psql("select id from users where email='admin@communiti.app'")
TOP = {t['slug']: t for t in call('GET', '/topics')['data']}
check(TOP['agriculture']['description'] == 'Farming, agritech, food security and more', 'topics carry descriptions')
AGRI, AI = TOP['agriculture']['id'], TOP['ai-ml']['id']

# ── Create account → verify → onboarding ────────────────────────────────────
call('POST', '/auth/register', body={'fullName': 'Rita Researcher', 'email': 'rita.r@example.com', 'location': 'Lugbe, Abuja', 'password': 'Secret123', 'confirmPassword': 'Secret999', 'acceptTerms': True}, expect=400)
call('POST', '/auth/register', body={'fullName': 'Rita Researcher', 'email': 'rita.r@example.com', 'location': 'Lugbe, Abuja', 'password': 'Secret123', 'confirmPassword': 'Secret123', 'acceptTerms': True}, expect=201)
v = call('POST', '/auth/verify-email', body={'email': 'rita.r@example.com', 'code': code_from_log()})
rita, rita_id = v['accessToken'], v['user']['id']
check(v['user']['verificationStatus'] == 'unverified' and not v['user']['onboardingComplete'], 'new account starts unverified, not onboarded')
ob = call('GET', '/me/onboarding', rita)
check(ob['nextStep'] == 'select_role' and ob['emailVerified'], 'onboarding: select role first')
check(call('GET', '/me', rita)['location'] == 'Lugbe, Abuja', 'location saved at sign-up')

call('PUT', '/me/role', rita, {'memberRole': 'researcher', 'details': {'researchEvidence': 'no identity'}}, expect=400)
call('PUT', '/me/role', rita, {'memberRole': 'researcher', 'details': {'orcidId': '1234'}}, expect=400)
call('PUT', '/me/role', rita, {'memberRole': 'expert', 'details': {}}, expect=400)  # legacy roles cannot be picked
me = call('PUT', '/me/role', rita, {'memberRole': 'researcher', 'details': {'institutionalEmail': 'Rita@Uni.edu.NG', 'orcidId': '0000-0006-0000-000x', 'researchProjectLink': 'https://research.example.org/rita', 'researchEvidence': 'Soil health in Kano'}})
check(me['memberRole'] == 'researcher' and me['verification']['status'] == 'pending' and me['verification']['details']['orcidId'] == '0000-0006-0000-000X', 'researcher form saved, pending review')
check(me['verification']['details']['institutionalEmail'] == 'rita@uni.edu.ng' and me['institutionalEmail'] == 'rita@uni.edu.ng', 'institutional email normalised and mirrored')
check(call('GET', '/me/onboarding', rita)['nextStep'] == 'interests', 'onboarding: topics next')
call('POST', '/posts', rita, {'body': 'too early'}, expect=403)
call('PUT', '/me/interests', rita, {'topicIds': [AGRI, AI]})
ob = call('GET', '/me/onboarding', rita)
check(ob['complete'] and ob['nextStep'] == 'done', 'onboarding complete after topics')

def member(name, email, role, details, topics=None):
    tok, uid = signup(name, email)
    call('PUT', '/me/role', tok, {'memberRole': role, 'details': details})
    call('PUT', '/me/interests', tok, {'topicIds': topics or [AGRI]})
    return tok, uid

# Innovator with uploaded evidence
ivan, ivan_id = signup('Ivan Innovator', 'ivan.i@example.com')
ev = media(ivan_id, 'document', 'application/pdf', 'private')
cue = media(ivan_id, 'image', 'image/png', 'private')
call('PUT', '/me/role', ivan, {'memberRole': 'innovator', 'details': {'ventureName': 'Green Hill', 'developmentStage': 'paused'}}, expect=400)
call('PUT', '/me/role', ivan, {'memberRole': 'innovator', 'details': {'ventureName': 'Green Hill', 'developmentStage': 'open', 'evidenceFileIds': [media(rita_id, 'document', 'application/pdf', 'private')]}}, expect=400)  # not your file
iv = call('PUT', '/me/role', ivan, {'memberRole': 'innovator', 'details': {'ventureName': 'Green Hill Solutions', 'description': 'Solar dryers', 'developmentStage': 'ongoing', 'evidenceLink': 'https://example.com/deck', 'evidenceFileIds': [ev], 'otherCueFileIds': [cue]}})
check(len(iv['verification']['files']) == 2 and iv['verification']['details']['developmentStage'] == 'ongoing', 'innovator evidence files attached')
call('PUT', '/me/interests', ivan, {'topicIds': [AGRI]})

pat, pat_id = member('Pat Professional', 'pat.p@example.com', 'professional', {'organizationName': 'Green Hill Solutions', 'professionalTitle': 'Machinist', 'profileLink': 'https://linkedin.com/in/pat', 'workEmail': 'pat@greenhill.ng'})
check(call('GET', '/me', pat)['headline'] == 'Machinist', 'professional title becomes headline')
lea, lea_id = member('Lara Learner', 'lara.l@example.com', 'learner', {'studentEmail': 'lara@abu.edu.ng', 'institution': 'Ahmadu Bello University', 'courseOfStudy': 'Business administration', 'level': '200'})

# ── Admin verification queue ────────────────────────────────────────────────
q = call('GET', '/admin/verifications?status=pending', adm)
check({rita_id, ivan_id, pat_id, lea_id} <= {r['user']['id'] for r in q['data']}, 'pending verifications listed')
check(len(call('GET', f'/admin/verifications/{ivan_id}', adm)['files']) == 2, 'admin sees evidence files')
ap = call('POST', f'/admin/verifications/{rita_id}/approve', adm, {})
check(ap['status'] == 'verified', 'researcher approved')
call('POST', f'/admin/verifications/{rita_id}/approve', adm, {}, expect=409)
call('POST', f'/admin/verifications/{lea_id}/reject', adm, {}, expect=400)  # reason required
call('POST', f'/admin/verifications/{lea_id}/reject', adm, {'note': 'Use your school email'})
check(call('GET', '/me', lea)['verification']['reviewNote'] == 'Use your school email', 'member sees rejection reason')
check(any(n['type'] == 'verification' for n in call('GET', '/notifications', lea)['data']), 'member notified of the decision')
call('PUT', '/me/role', lea, {'memberRole': 'learner', 'details': {'studentEmail': 'lara@student.abu.edu.ng', 'institution': 'Ahmadu Bello University', 'courseOfStudy': 'Business administration'}})
check(call('GET', '/me', lea)['verificationStatus'] == 'pending', 'resubmission goes back to pending')
check(call('GET', f'/admin/users/{ivan_id}', adm)['verification']['memberRole'] == 'innovator', 'admin user panel shows the role form')
check(call('GET', '/me', rita)['verificationStatus'] == 'verified', 'verified status on /me')

# Evaluations: verified researcher yes, unverified professional no
pj = call('POST', '/projects', rita, {'title': 'Soil sensors', 'pitch': 'Cheap soil sensors', 'topicIds': [AGRI]}, expect=201)
call('POST', f"/projects/{pj['id']}/evaluations", rita, {'feasibility': 4, 'sustainability': 5, 'novelty': 4, 'feedback': 'Promising field results so far.'}, expect=201)
pj2 = call('POST', '/projects', pat, {'title': 'Lathe kit'}, expect=201)
call('POST', f"/projects/{pj2['id']}/evaluations", pat, {'feasibility': 3, 'sustainability': 3, 'novelty': 3, 'feedback': 'Looks reasonable to me overall.'}, expect=403)

# Changing role from Edit Profile clears verification
check(call('PATCH', '/me', pat, {'memberRole': 'innovator'})['verificationStatus'] == 'unverified', 'role change clears verification')
call('PATCH', '/me', pat, {'memberRole': 'professional'})

# ── Posts: attachments, views, follow button, Not interested ─────────────────
doc = media(rita_id, 'document', 'application/pdf', 'public')
p = call('POST', '/posts', rita, {'body': 'Field report on soil health in Kano #agri', 'topicIds': [AGRI], 'mediaIds': [doc]}, expect=201)
check(p['author']['verified'] and p['viewCount'] == 0 and len(p['media']) == 1, 'post with document, verified author')
call('GET', f"/posts/{p['id']}", rita)
call('GET', f"/posts/{p['id']}", ivan)
pv = call('GET', f"/posts/{p['id']}", ivan)
check(pv['viewCount'] == 1 and not pv['followingAuthor'], 'one view per member, author excluded')
call('POST', f'/users/{rita_id}/follow', ivan)
check(call('GET', f"/posts/{p['id']}", ivan)['followingAuthor'], 'followingAuthor after follow')
fid = lambda tok, tab='for-you': [x['id'] for x in call('GET', f'/feed?tab={tab}&limit=50', tok)['data']]
check(p['id'] in fid(ivan), 'post in feed')
call('POST', f"/posts/{p['id']}/not-interested", ivan, expect=204)
check(p['id'] not in fid(ivan) and p['id'] not in fid(ivan, 'following'), 'Not interested hides it from feeds')
call('GET', f"/posts/{p['id']}", ivan)  # still reachable directly
call('DELETE', f"/posts/{p['id']}/not-interested", ivan, expect=204)
check(p['id'] in fid(ivan), 'undo Not interested')

# ── Comments: attachments and Latest / Popular ──────────────────────────────
img = media(ivan_id, 'image', 'image/jpeg', 'public')
call('POST', f"/posts/{p['id']}/comments", ivan, {'body': ''}, expect=400)
c1 = call('POST', f"/posts/{p['id']}/comments", ivan, {'mediaIds': [img]}, expect=201)
check(len(c1['media']) == 1 and c1['body'] == '', 'image-only comment')
c2 = call('POST', f"/posts/{p['id']}/comments", pat, {'body': 'Great data'}, expect=201)
call('POST', f"/comments/{c1['id']}/like", rita)
check(call('GET', f"/posts/{p['id']}/comments?sort=popular", rita)['data'][0]['id'] == c1['id'], 'popular = most liked')
check(call('GET', f"/posts/{p['id']}/comments?sort=latest", rita)['data'][0]['id'] == c2['id'], 'latest = newest')
call('POST', '/reports', rita, {'targetType': 'comment', 'targetId': c2['id'], 'reason': 'intellectual_property'}, expect=201)

# ── Blocking ────────────────────────────────────────────────────────────────
pp = call('POST', '/posts', pat, {'body': 'Machinist tips for small workshops'}, expect=201)
call('POST', f'/users/{rita_id}/follow', pat)
call('POST', f'/users/{pat_id}/block', rita, expect=204)
check(pp['id'] not in fid(rita), "blocked member's posts hidden")
call('GET', f"/posts/{pp['id']}", rita, expect=404)
check(all(c['author']['id'] != pat_id for c in call('GET', f"/posts/{p['id']}/comments?sort=latest", rita)['data']), "blocked member's comments hidden")
call('POST', f'/users/{rita_id}/follow', pat, expect=403)
call('GET', f'/users/{rita_id}', pat, expect=404)
check(call('GET', f'/users/{pat_id}', rita)['blockedByMe'], 'profile shows blockedByMe')
check(call('GET', f'/users/{rita_id}', ivan)['followerCount'] == 1, 'block removed the follow (counters updated)')
call('POST', '/conversations/direct', pat, {'userId': rita_id}, expect=403)
call('POST', '/collaboration-requests', pat, {'recipientId': rita_id}, expect=403)
check(any(u['id'] == pat_id for u in call('GET', '/me/blocked-users', rita)['data']), 'blocked list')
check(all(u['id'] != pat_id for u in call('GET', '/search?q=Pat%20Pro&type=people', rita)['people']), 'blocked member hidden from search')
call('DELETE', f'/users/{pat_id}/block', rita, expect=204)
call('GET', f"/posts/{pp['id']}", rita)

# ── Search and trending ─────────────────────────────────────────────────────
s = call('GET', '/search?q=agri', rita)
check(set(s) >= {'people', 'posts', 'events', 'highlights', 'topics', 'forums', 'projects'} and any(t['slug'] == 'agriculture' for t in s['topics']), 'search returns every tab incl. topics')
check(any(x['id'] == p['id'] for x in call('GET', f'/search?q=soil&type=posts&topicId={AGRI}', ivan)['posts']), 'topic tab filters posts')
check(call('GET', f'/search?q=soil&type=posts&topicId={AI}', ivan)['posts'] == [], 'topic tab excludes other topics')
call('GET', '/search?q=innovate&type=events', rita); call('GET', '/search?q=tetfair&type=highlights', rita)
f = call('POST', '/forums', rita, {'name': 'Agricultural technology', 'about': 'Agritech talk', 'topicIds': [AGRI]}, expect=201)
call('POST', '/posts', rita, {'body': 'Welcome to the forum', 'forumId': f['id'], 'audience': 'forum'}, expect=201)
tr = call('GET', '/trending/forums?topic=agriculture', rita)
check(tr['topic']['slug'] == 'agriculture' and any(x['id'] == f['id'] and x['postCount'] == 1 for x in tr['data']), 'trending in a topic with post counts')
check(call('GET', '/trending/forums?topic=nope', rita)['data'] == [], 'unknown topic → empty')

# ── Collaboration requests ──────────────────────────────────────────────────
cr = call('POST', '/collaboration-requests', ivan, {'recipientId': pat_id, 'message': 'I would like to collab with you on a project'}, expect=201)
call('POST', '/collaboration-requests', ivan, {'recipientId': pat_id}, expect=409)
call('POST', '/collaboration-requests', pat, {'recipientId': ivan_id}, expect=409)
call('POST', '/collaboration-requests', ivan, {'recipientId': ivan_id}, expect=400)
check(call('GET', '/collaboration-requests/pending-count', pat)['count'] == 1, 'pending count')
check(call('GET', f'/users/{pat_id}', ivan)['collaborationRequest']['direction'] == 'sent', 'profile shows pending request')
check(call('GET', '/collaboration-requests?box=sent', ivan)['data'][0]['id'] == cr['id'], 'sent box')
call('POST', f"/collaboration-requests/{cr['id']}/accept", ivan, expect=403)
before = call('GET', f'/users/{ivan_id}', pat)['collaborationCount']
acc = call('POST', f"/collaboration-requests/{cr['id']}/accept", pat)
check(acc['status'] == 'accepted' and acc['conversationId'], 'accepted, chat opened')
check(call('GET', f'/users/{ivan_id}', pat)['collaborationCount'] == before + 1, 'collaboration counted')
call('POST', f"/collaboration-requests/{cr['id']}/decline", pat, expect=409)
conv = [c for c in call('GET', '/conversations', ivan)['data'] if c['id'] == acc['conversationId']]
check(conv and 'now collaborating' in conv[0]['lastMessagePreview'], 'system message in the new chat')
# project invite
inv = call('POST', '/collaboration-requests', rita, {'recipientId': lea_id, 'projectId': pj['id'], 'message': 'Join Soil sensors?'}, expect=201)
check(inv['project']['title'] == 'Soil sensors', 'invite carries the project')
call('POST', '/collaboration-requests', ivan, {'recipientId': lea_id, 'projectId': pj['id']}, expect=403)  # not project admin
call('POST', f"/collaboration-requests/{inv['id']}/accept", lea)
check(call('GET', f"/projects/{pj['id']}", lea)['myRole'] == 'contributor', 'invite accepted → project member')
d = call('POST', '/collaboration-requests', ivan, {'recipientId': lea_id}, expect=201)
check(call('POST', f"/collaboration-requests/{d['id']}/decline", lea)['status'] == 'declined', 'decline')
x = call('POST', '/collaboration-requests', ivan, {'recipientId': lea_id}, expect=201)
call('DELETE', f"/collaboration-requests/{x['id']}", lea, expect=403)
call('DELETE', f"/collaboration-requests/{x['id']}", ivan, expect=204)

# ── Chat: presence, search, delete ──────────────────────────────────────────
cid = acc['conversationId']
call('POST', f'/conversations/{cid}/messages', ivan, {'body': 'The Mechanical BOM is ready to deliver'}, expect=201)
call('POST', f'/conversations/{cid}/messages', pat, {'body': 'Okay, begin the documentation'}, expect=201)
cd = call('GET', f'/conversations/{cid}', ivan)
check(cd['otherUserProfile']['online'] and cd['otherUserProfile']['collaborationCount'] >= 1, 'online + profile card')
call('PATCH', '/me/settings', pat, {'showOnlineStatus': False})
check(call('GET', f'/conversations/{cid}', ivan)['otherUserProfile']['online'] is False, 'online status can be hidden')
hits = call('GET', f'/conversations/{cid}/messages?q=bom', ivan)['data']
check(len(hits) == 1 and 'BOM' in hits[0]['body'], 'search in chat')
call('DELETE', f'/conversations/{cid}', ivan, expect=204)
check(all(c['id'] != cid for c in call('GET', '/conversations', ivan)['data']), 'deleted chat hidden')
check(call('GET', f'/conversations/{cid}/messages', ivan)['data'] == [], 'deleted chat history cleared')
import time; time.sleep(0.01)
call('POST', f'/conversations/{cid}/messages', pat, {'body': 'Are you there?'}, expect=201)
check(any(c['id'] == cid for c in call('GET', '/conversations', ivan)['data']), 'chat returns on a new message')
check(len(call('GET', f'/conversations/{cid}/messages', ivan)['data']) == 1, 'only the new message is visible')

# ── Projects and forums ─────────────────────────────────────────────────────
allp = call('GET', '/projects?tab=all&limit=50', rita)['data']
check(any(x['id'] == pj['id'] and len(x['memberAvatars']) == 2 for x in allp), 'all tab includes my projects with member avatars')
call('POST', f"/forums/{f['id']}/join", ivan)
fy = call('GET', '/forums?tab=for-you', ivan)['data']
check(any(x['id'] == f['id'] for x in fy), 'For You forums by interest')
fv = call('GET', f"/forums/{f['id']}", ivan)
check(len(fv['memberAvatars']) == 2 and fv['isMember'] and not fv['isMuted'], 'forum members preview')
fp = call('POST', '/posts', ivan, {'body': 'My first forum post', 'forumId': f['id'], 'audience': 'forum'}, expect=201)
call('POST', f"/posts/{fp['id']}/like", rita)
call('POST', f"/posts/{fp['id']}/comments", ivan, {'body': 'replying on my own'}, expect=201)
fposts = lambda s: [x['id'] for x in call('GET', f"/forums/{f['id']}/posts?sort={s}", ivan)['data']]
check(fposts('popular')[0] == fp['id'] and fposts('mine') == [fp['id']] and fp['id'] in fposts('my_replies'), 'forum post filters')
check(call('POST', f"/forums/{f['id']}/mute", ivan, {'muted': True})['isMuted'], 'mute forum')
check(fp['id'] not in fid(ivan, 'forums'), 'muted forum left out of feed')
call('POST', f"/forums/{f['id']}/mute", ivan, {'muted': False})
call('POST', f"/forums/{f['id']}/mute", pat, {}, expect=403)

# ── Explore ─────────────────────────────────────────────────────────────────
g1, g2 = media(admin_id), media(admin_id)
ft = call('POST', '/admin/featured', adm, {'title': 'VR Interface', 'summary': 'Drones and VR', 'topicIds': [AGRI], 'mediaIds': [g1, g2], 'publish': True}, expect=201)
check(len(ft['media']) == 2 and ft['topics'][0]['id'] == AGRI, 'admin sets featured topics and gallery')
check(any(x['id'] == ft['id'] for x in call('GET', f'/featured?topicIds={AGRI}', rita)['data']), 'sort featured by topic')
check(all(x['id'] != ft['id'] for x in call('GET', f'/featured?topicIds={AI}', rita)['data']), 'other topic excludes it')
call('GET', '/featured?topicIds=nope', rita, expect=400)
check(call('GET', f"/featured/{ft['id']}", rita)['shareUrl'].endswith(ft['id']), 'featured view with share link')
h1 = call('POST', '/admin/highlights', adm, {'title': 'Research for impact', 'mediaIds': [g1]}, expect=201)
h2 = call('POST', '/admin/highlights', adm, {'title': 'Tetfair moments', 'mediaIds': [g2]}, expect=201)
call('GET', f"/highlights/{h1['id']}", rita)
check(all(x['id'] != h1['id'] for x in call('GET', f"/highlights?exclude={h1['id']}", rita)['data']), 'More like this excludes the open album')
call('GET', '/events?when=concluded', rita)
sg = call('GET', '/explore/suggested', ivan)
check(set(sg) == {'projects', 'forums', 'people', 'events'} and any(x['id'] == pj['id'] for x in sg['projects']), 'Suggested for you')
check(call('GET', f'/users/{rita_id}', ivan)['verified'], 'profile shows verified')

# ── Admin: verification filter, pending count ─────────────────────────────────
check(call('GET', '/admin/stats/overview', adm)['pendingVerifications'] >= 2, 'overview counts pending verifications')
vu = call('GET', '/admin/users?verificationStatus=verified', adm)['data']
check(any(u['id'] == rita_id for u in vu) and all(u['verificationStatus'] == 'verified' for u in vu), 'users table filter by verification')

# ── Blocked people are left out of follower lists ────────────────────────────
call('POST', f'/users/{rita_id}/follow', lea)
call('POST', f'/users/{lea_id}/block', ivan, expect=204)
check(all(u['id'] != lea_id for u in call('GET', f'/users/{rita_id}/followers', ivan)['data']), 'blocked member hidden from follower lists')
check(any(u['id'] == lea_id for u in call('GET', f'/users/{rita_id}/followers', rita)['data']), 'others still see them')

# ── Account purge removes verification data, blocks and pending requests ─────
gone, gone_id = member('Gina Gone', 'gina.g@example.com', 'researcher', {'orcidId': '0000-0001-0002-0003'})
call('POST', f'/users/{rita_id}/block', gone, expect=204)
call('POST', '/collaboration-requests', gone, {'recipientId': ivan_id}, expect=201)
call('DELETE', '/me', gone, {'password': 'Secret123', 'confirm': 'DELETE'}, expect=204)
psql(f"update users set deletion_scheduled_for = now() - interval '1 day' where id = '{gone_id}'")
call('GET', '/internal/cron/cleanup', 'cron-test')
check(psql(f"select count(*) from member_verifications where user_id = '{gone_id}'") == '0', 'purge deletes the verification form')
check(psql(f"select count(*) from user_blocks where blocker_id = '{gone_id}' or blocked_id = '{gone_id}'") == '0', 'purge deletes blocks')
check(psql(f"select count(*) from collaboration_requests where sender_id = '{gone_id}' and status = 'pending'") == '0', 'purge cancels pending requests')
check(psql(f"select verification_status || '|' || email from users where id = '{gone_id}'") == f'unverified|deleted-{gone_id}@deleted.invalid', 'purged account anonymised')
