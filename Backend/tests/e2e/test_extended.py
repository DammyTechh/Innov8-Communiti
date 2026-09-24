# Edge cases, permissions, media endpoints and regression checks for fixed bugs.

chi=call('POST','/auth/login',body={'email':'chioma@example.com','password':'Secret123'})['accessToken']
adm_id=psql("select id from users where email='admin@communiti.app'")

# regressions
x, x_id = signup('Xavier Nobody','xavier@example.com')
call('PATCH','/me/onboarding',x,{'memberRole':'student','dateOfBirth':'2000-01-01','country':'GH','topicIds':T[:1]})
check(call('GET','/conversations',x)['data']==[], 'LEAK: non-member sees project chats')
cv=call('GET','/conversations',chi)['data']
check(len(cv)==1, f'duplicate rows: {len(cv)}')
call('PATCH','/me/settings',ada,{'notificationPrefs':{'follow':{'inApp':True,'push':False,'email':False}}})
st=call('PATCH','/me/settings',ada,{'notificationPrefs':{'post_like':{'inApp':False,'push':False,'email':False}}})
check(set(st['notificationPrefs'])=={'follow','post_like'}, 'notificationPrefs merge')
before=len(call('GET','/notifications',ada)['data'])
call('POST',f"/conversations/{dm['id']}/messages",tunde,{'body':'push only?'},expect=201)
check(len(call('GET','/notifications',ada)['data'])==before, 'chat messages push-only')
check(call('GET','/users/suggested?limit=5',x) is not None, "call('GET','/users/suggested?limit=5',x) is not None")
s=call('GET','/search?q=%25%25&type=people',chi)
check(s['people']==[], 'LIKE wildcard escaped')

# parallel refresh race: both succeed, session survives
R=call('POST','/auth/login',body={'email':'tunde@example.com','password':'Secret123'}); rt=R['refreshToken']; res=[]
def refresh(): res.append(call('POST','/auth/refresh',body={'refreshToken':rt}))
th=[threading.Thread(target=refresh) for _ in range(2)]; [t.start() for t in th]; [t.join() for t in th]
new=[r['refreshToken'] for r in res if r and r.get('refreshToken')]
check(all(r and r.get('accessToken') for r in res) and len(new)==1, 'parallel refresh: both get access, one rotates')
call('POST','/auth/refresh',body={'refreshToken':new[0]})

# auth extras
call('POST','/auth/verify-email/resend',body={'email':'nobody@example.com'},expect=202)
call('POST','/auth/google/token',body={'idToken':'x'*30},expect=503)
ss=call('GET','/auth/sessions',tunde)['data']; other=[s for s in ss if not s['current']][0]
call('DELETE',f"/auth/sessions/{other['id']}",tunde,expect=204)
call('DELETE',f"/auth/sessions/{uuid.uuid4()}",tunde,expect=404)
call('POST','/uploads/presign',ada,{'purpose':'post','mimeType':'image/jpeg','sizeBytes':1000},expect=503)
call('POST','/uploads/presign',ada,{'purpose':'avatar','mimeType':'application/pdf','sizeBytes':1000},expect=415)

# me / users
call('PUT','/me/interests',ada,{'topicIds':T[2:5]})
check(call('GET',f'/users/lookup?ids={ada_id},{tunde_id},bad',chi)['data'].__len__()==2, "call('GET',f'/users/lookup?ids={ada_id},{tunde_id},bad',chi)['data']._")
call('GET',f'/users/{tunde_id}/following',chi)
call('DELETE',f'/users/{ada_id}/follow',tunde)
check(call('GET',f"/users/by-username/{me['username']}",chi)['followerCount']==0, 'call(\'GET\',f"/users/by-username/{me[\'username\']}",chi)[\'followerCount\'')

# posts with media, edit, delete
m1=media(ada_id); m2=media(tunde_id)
call('POST','/posts',ada,{'body':'','mediaIds':[m2]},expect=400)  # not owner
pm=call('POST','/posts',ada,{'body':'','mediaIds':[m1]},expect=201)
check(len(pm['media'])==1 and pm['media'][0]['kind']=='image', "len(pm['media'])==1 and pm['media'][0]['kind']=='image'")
call('PATCH',f"/posts/{pm['id']}",ada,{'body':'Now with caption'})
call('DELETE',f"/posts/{p['id']}/like",tunde)
cc=call('POST',f"/posts/{pm['id']}/comments",tunde,{'body':'nice'},expect=201)
call('PATCH',f"/comments/{cc['id']}",tunde,{'body':'very nice'}); call('PATCH',f"/comments/{cc['id']}",chi,{'body':'x'},expect=403)
call('DELETE',f"/comments/{c['id']}/like",ada)
call('DELETE',f"/comments/{cc['id']}",ada,expect=204)  # post author can delete
call('DELETE',f"/posts/{pm['id']}",ada,expect=204); call('GET',f"/posts/{pm['id']}",ada,expect=404)
call('GET',f'/users/{ada_id}/posts',chi)
call('GET','/search?q=solar&type=posts',chi); call('GET','/search?q=agri&type=forums',chi); call('GET','/search?q=solar&type=projects',chi)
call('DELETE','/search/recent',chi,expect=204)

# forums admin
call('PATCH',f"/forums/{f['id']}",tunde,{'about':'x'},expect=403)
call('POST',f"/forums/{f['id']}/members",ada,{'userId':chi_id,'role':'moderator'},expect=204)
call('PATCH',f"/forums/{f['id']}",chi,{'about':'Moderated'})
call('DELETE',f"/forums/{f['id']}/members/{ada_id}",chi,expect=403)
call('DELETE',f"/forums/{f['id']}/members/{tunde_id}",chi,expect=204)
pf=call('POST','/forums',x,{'name':'Private Club','visibility':'private'},expect=201)
call('POST',f"/forums/{pf['id']}/join",tunde,expect=403); call('GET',f"/forums/{pf['id']}",tunde,expect=404)

# workspace extras
call('GET',f"/projects/{P}/research/{rd['id']}",chi)
call('PATCH',f"/projects/{P}/research/{rd['id']}",tunde,{'title':'Pump flow analysis v2'})
md=media(tunde_id,'document','application/pdf','private')
up=call('POST',f'/projects/{P}/research',tunde,{'kind':'uploaded','title':'Datasheet','mediaId':md},expect=201)
check(up['file']['kind']=='document', "up['file']['kind']=='document'")
call('DELETE',f"/projects/{P}/research/{up['id']}",chi,expect=403)
call('DELETE',f"/projects/{P}/research/{up['id']}",ada,expect=204)
mv=media(tunde_id,'video','video/mp4','private')
v=call('POST',f"/projects/{P}/prototypes/{proto['id']}/versions",tunde,{'versionLabel':'v1.0','notes':'First build','mediaIds':[mv]},expect=201)
call('POST',f"/projects/{P}/prototypes/{proto['id']}/versions",tunde,{'versionLabel':'v1.0','mediaIds':[media(tunde_id)]},expect=409)
pd2=call('GET',f"/projects/{P}/prototypes/{proto['id']}",ada)
check(pd2['versionCount']==1 and pd2['latestVersionLabel']=='v1.0' and len(pd2['versions'][0]['media'])==1, "pd2['versionCount']==1 and pd2['latestVersionLabel']=='v1.0' and len(p")
wc=call('POST',f'/projects/{P}/workspace-comments',ada,{'targetType':'prototype_version','targetId':v['id'],'body':'Looks solid'},expect=201)
call('DELETE',f"/projects/{P}/workspace-comments/{wc['id']}",tunde,expect=403)
call('DELETE',f"/projects/{P}/workspace-comments/{wc['id']}",ada,expect=204)
call('PATCH',f"/projects/{P}/prototypes/{proto['id']}",tunde,{'description':'ESP32 based'})
call('PATCH',f"/projects/{P}/evaluations/{ev['id']}",chi,{'novelty':4})
check(call('GET',f'/projects/{P}/evaluations',ada)['summary']['novelty']==4, "call('GET',f'/projects/{P}/evaluations',ada)['summary']['novelty']==4")
call('DELETE',f"/projects/{P}/evaluations/{ev['id']}",chi,expect=204)
mc=media(ada_id,'document','application/pdf','private')
ct=call('POST',f'/projects/{P}/contracts',ada,{'title':'Collaboration agreement','mediaId':mc},expect=201)
call('POST',f'/projects/{P}/contracts',tunde,{'title':'Contributor attempt','mediaId':mc},expect=403)
cs=call('PATCH',f"/projects/{P}/contracts/{ct['id']}",ada,{'status':'signed'})
check(cs['signedAt'], "cs['signedAt']")
call('GET',f'/projects/{P}/contracts',chi); call('DELETE',f"/projects/{P}/contracts/{ct['id']}",ada,expect=204)
t2=call('POST',f'/projects/{P}/tasks',tunde,{'title':'Order parts'},expect=201)
call('GET',f'/projects/{P}/tasks?assignee=me',tunde); call('GET',f'/projects/{P}/tasks?status=done',ada)
call('PATCH',f"/projects/{P}/tasks/{t['id']}",tunde,{'status':'todo'})
call('DELETE',f"/projects/{P}/tasks/{t2['id']}",chi,expect=403); call('DELETE',f"/projects/{P}/tasks/{t2['id']}",tunde,expect=204)
call('GET',f'/projects/{P}/ledger?type=task_completed',ada)
check(call('GET',f'/projects/{P}/notification-settings',tunde)['tasks'] is False, "call('GET',f'/projects/{P}/notification-settings',tunde)['tasks'] is F")

# projects membership extras
call('PATCH',f'/projects/{P}/members/{chi_id}',ada,{'role':'contributor','title':'Hydrologist'},expect=204)
call('PATCH',f'/projects/{P}/members/{ada_id}',ada,{'role':'viewer'},expect=403)
jx=call('POST',f'/projects/{P}/join-requests',x,{},expect=201)
call('POST',f"/projects/{P}/join-requests/{jx['id']}/decline",ada,{},expect=204)
call('POST',f"/projects/{P}/join-requests/{jx['id']}/accept",ada,{},expect=404)
call('POST',f'/projects/{P}/join-requests',x,{},expect=201); call('DELETE',f'/projects/{P}/join-requests/mine',x,expect=204)
call('POST',f'/projects/{P}/transfer-ownership',ada,{'userId':tunde_id},expect=204)
check(call('GET',f'/projects/{P}',ada)['myRole']=='admin', "call('GET',f'/projects/{P}',ada)['myRole']=='admin'")
call('DELETE',f'/projects/{P}/members/{chi_id}',chi,expect=204)   # leave
check(call('GET','/conversations',chi)['data']==[], 'left member removed from project chat')
call('DELETE',f'/projects/{P}/members/{tunde_id}',tunde,expect=400)  # owner can't leave

# chat extras
call('GET',f"/conversations/{dm['id']}",ada)
mm=media(ada_id)
msg=call('POST',f"/conversations/{dm['id']}/messages",ada,{'body':'see photo','mediaIds':[mm],'replyToId':ms['data'][0]['id']},expect=201)
check(msg['replyTo'] and len(msg['media'])==1, "msg['replyTo'] and len(msg['media'])==1")
call('PATCH',f"/messages/{msg['id']}",ada,{'body':'see this photo'}); call('PATCH',f"/messages/{msg['id']}",tunde,{'body':'x'},expect=404)
call('DELETE',f"/messages/{msg['id']}",ada,expect=204)
dl=call('GET',f"/conversations/{dm['id']}/messages?limit=1",tunde)
check(dl['data'][0]['isDeleted'] and dl['nextCursor'], "dl['data'][0]['isDeleted'] and dl['nextCursor']")
call('GET',f"/conversations/{dm['id']}/messages?limit=1&cursor={dl['nextCursor']}",tunde)
call('DELETE',f"/conversations/{dm['id']}/messages",ada,expect=204)
check(call('GET',f"/conversations/{dm['id']}/messages",ada)['data']==[], 'call(\'GET\',f"/conversations/{dm[\'id\']}/messages",ada)[\'data\']==[]')
call('GET','/conversations?limit=1',tunde)
call('POST','/conversations/direct',ada,{'userId':ada_id},expect=400)

# notifications / explore
call('GET','/notifications?filter=unread',tunde); call('DELETE','/push-tokens',ada,{'token':'ExponentPushToken[abc123xyz]'},expect=204)
call('DELETE',f"/events/{e['id']}/rsvp",tunde,expect=204)
check(call('GET',f"/events/{e['id']}",ada)['interestedCount']==0, 'call(\'GET\',f"/events/{e[\'id\']}",ada)[\'interestedCount\']==0')
call('GET','/events?when=going',tunde)
fe=call('GET','/featured',ada)['data'][0]; call('GET',f"/featured/{fe['id']}",ada)

# admin extras
call('GET',f"/admin/reports/{rp['id']}",adm)
call('PATCH',f'/admin/users/{tunde_id}/role',adm,{'platformRole':'moderator'},expect=204)
mod=call('POST','/auth/admin/login',body={'email':'tunde@example.com','password':'Secret123'},client='admin')['accessToken']
call('POST',f'/admin/users/{x_id}/status',mod,{'action':'block'},expect=403)   # moderators can't block
call('POST',f'/admin/users/{adm_id}/status',mod,{'action':'warn'},expect=403)  # can't act on higher role
call('POST',f'/admin/users/{x_id}/status',mod,{'action':'warn','reason':'Be kind'})
call('POST','/admin/events',mod,{'title':'Moderator attempt','startsAt':'2026-10-02T17:00:00Z','endsAt':'2026-10-03T17:00:00Z'},expect=403)
call('POST',f"/admin/content/comment/{c['id']}/remove",mod,{'note':'off-topic'},expect=204)
call('GET',f"/comments/{c['id']}/replies",chi,expect=404)
call('GET','/admin/broadcasts',adm)
call('PATCH',f"/admin/featured/{fe['id']}",adm,{'publish':False})
check(call('GET','/featured',ada)['data']==[], "call('GET','/featured',ada)['data']==[]")
call('DELETE',f"/admin/featured/{fe['id']}",adm,expect=204)
hm=media(adm_id)
h=call('POST','/admin/highlights',adm,{'title':'Demo day recap','mediaIds':[hm]},expect=201)
check(len(call('GET','/highlights',ada)['data'])==1, "len(call('GET','/highlights',ada)['data'])==1")
call('PATCH',f"/admin/highlights/{h['id']}",adm,{'caption':'Great turnout'}); call('GET','/admin/highlights',adm)
call('DELETE',f"/admin/highlights/{h['id']}",adm,expect=204)
call('DELETE',f"/admin/events/{e['id']}",adm,expect=204); call('GET',f"/events/{e['id']}",ada,expect=404)
call('GET','/admin/users?sort=most_reported',adm); call('GET','/admin/stats/user-activity?period=12m',adm)
call('GET','/admin/audit-logs',mod,expect=403)
call('DELETE',f'/projects/{P}',ada,expect=403); call('DELETE',f'/projects/{P}',tunde,expect=204)
call('DELETE',f"/forums/{f['id']}",ada,expect=204)

# account deletion + logout-all
call('DELETE','/me',x,{'confirm':'DELETE','password':'wrong'},expect=400)
call('DELETE','/me',x,{'confirm':'DELETE','password':'Secret123'},expect=204)
call('GET','/me',x,expect=401)
call('POST','/auth/logout-all',ada,expect=204); call('GET','/me',ada,expect=401)
