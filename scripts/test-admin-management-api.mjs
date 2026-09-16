import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PrismaClient} from '../packages/database/generated/client/index.js';
const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
assert.equal(url.pathname,'/admin_management_test','Disposable DB only');
const base=process.env.ADMIN_MANAGEMENT_API_URL??'http://127.0.0.1:3241';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const db=new PrismaClient();
const password='Management-test123!';
async function request(method,path,cookie,body,expected=200,headers={}) {
 const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);
 return {data:text?JSON.parse(text):undefined,headers:response.headers};
}
try{
 const sessions={};
 for(const role of ['USER','MODERATOR','ADMIN']) {
  const email=`management-${role.toLowerCase()}@example.test`;
  const response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert([201,409].includes(response.status));
  const user=await db.user.update({where:{email},data:{role,isActive:true}});
  const login=await request('POST','/auth/login',undefined,{email,password});
  sessions[role]={id:user.id,email,password,cookie:login.headers.get('set-cookie').split(';')[0]};
 }
 const admin=sessions.ADMIN.cookie;
 for(const cookie of [undefined,sessions.USER.cookie,sessions.MODERATOR.cookie]) {
  for(const [method,path,body] of [
   ['GET','/users'],['POST','/users',{email:'forbidden@example.test',password}],['GET','/users/none'],['PATCH','/users/none',{version:1,role:'ADMIN'}],['DELETE','/users/none',{version:1}],
   ['GET','/games'],['GET','/games/none'],['PATCH','/games/none',{updatedAt:new Date().toISOString(),title:'No'}],['DELETE','/games/none',{updatedAt:new Date().toISOString()}],
  ]) await request(method,'/admin'+path,cookie,body,cookie?403:401);
 }
 const list=await request('GET','/admin/users?query=management&limit=2',admin);
 assert.equal(list.data.items.length,2);assert.equal(list.data.total,3);assert.match(list.headers.get('cache-control'),/private.*no-store/);
 assert(!JSON.stringify(list.data).includes('passwordHash'));
 let created=(await request('POST','/admin/users',admin,{email:' CREATED@example.test ',password,displayName:'Managed creator',role:'USER'},201)).data;
 assert.equal(created.email,'created@example.test');assert.equal(created.isActive,true);assert.equal(created.version,1);
 await request('POST','/admin/users',admin,{email:'created@example.test',password},409);
 const login=await request('POST','/auth/login',undefined,{email:created.email,password});const targetCookie=login.headers.get('set-cookie').split(';')[0];
 created=(await request('PATCH','/admin/users/'+created.id,admin,{version:created.version,isActive:false})).data;
 await request('GET','/auth/me',targetCookie,undefined,401);
 await request('POST','/auth/login',undefined,{email:created.email,password},401);
 assert.equal((await request('GET','/admin/users?active=false',admin)).data.items.some(u=>u.id===created.id),true);
 await request('PATCH','/admin/users/'+created.id,admin,{version:1,isActive:true},409);
 created=(await request('PATCH','/admin/users/'+created.id,admin,{version:created.version,isActive:true,password:'Replacement-test123!',role:'MODERATOR',displayName:'Updated creator'})).data;
 await request('POST','/auth/login',undefined,{email:created.email,password},401);
 await request('POST','/auth/login',undefined,{email:created.email,password:'Replacement-test123!'});
 const races=await Promise.all(['Concurrent one','Concurrent two'].map(displayName=>fetch(base+'/admin/users/'+created.id,{method:'PATCH',headers:{Cookie:admin,'Content-Type':'application/json'},body:JSON.stringify({version:created.version,displayName})})));
 assert.deepEqual(races.map(x=>x.status).sort(),[200,409]);
 created=(await request('GET','/admin/users/'+created.id,admin)).data;
 const self=(await request('GET','/admin/users/'+sessions.ADMIN.id,admin)).data;
 for(const mutation of [{role:'USER'},{isActive:false}])await request('PATCH','/admin/users/'+self.id,admin,{version:self.version,...mutation},409);
 await request('DELETE','/admin/users/'+self.id,admin,{version:self.version},409);
 await request('PATCH','/admin/users/'+created.id,admin,{version:created.version,isActive:false},403,{Origin:'https://evil.example'});
 // Real owner workflow creates legacy draft; admin must see it despite different owner.
 let game=(await request('POST','/games',sessions.USER.cookie,{title:'Managed game',slug:'management-game',sourceType:'CODE'},201)).data;
 await request('DELETE','/admin/users/'+sessions.USER.id,admin,{version:1},409);
 const games=await request('GET','/admin/games?query=management-user',admin);assert(games.data.items.some(g=>g.id===game.id));
 assert.match(games.headers.get('cache-control'),/private.*no-store/);
 await request('PATCH','/admin/games/'+game.id,admin,{updatedAt:game.updatedAt,visibility:'PUBLIC'},409);
 game=(await request('PATCH','/admin/games/'+game.id,admin,{updatedAt:game.updatedAt,title:'Renamed game',description:'Admin updated',moderationState:'QUARANTINED'})).data;
 assert.equal(game.title,'Renamed game');assert.equal(game.moderationState,'QUARANTINED');
 await request('PATCH','/admin/games/'+game.id,admin,{updatedAt:'2000-01-01T00:00:00.000Z',title:'Stale'},409);
 await request('PATCH','/admin/games/'+game.id,admin,{updatedAt:game.updatedAt,sourceType:'UPLOAD'},400);
 await db.game.update({where:{id:game.id},data:{reviewState:'APPROVED',visibility:'PUBLIC',moderationState:'CLEAR',artifactReady:true,artifactVersion:1}});
 game=(await request('GET','/admin/games/'+game.id,admin)).data;
 game=(await request('PATCH','/admin/games/'+game.id,admin,{updatedAt:game.updatedAt,title:'Changed approved title'})).data;
 assert.equal(game.reviewState,'DRAFT');assert.equal(game.visibility,'DRAFT');
 await db.gameBuild.create({data:{gameId:game.id,creatorId:sessions.USER.id,state:'READY',runtimeFamily:'legacy',runtimeVersion:'1',legacyArtifactVersion:1}});
 game=(await request('GET','/admin/games/'+game.id,admin)).data;assert.equal(game.buildCount,1);
 await request('DELETE','/admin/games/'+game.id,admin,{updatedAt:game.updatedAt},409);
 const deletable=(await request('POST','/games',sessions.USER.cookie,{title:'Delete draft',slug:'management-delete',sourceType:'CODE'},201)).data;
 await request('DELETE','/admin/games/'+deletable.id,admin,{updatedAt:deletable.updatedAt},204);
 await request('GET','/admin/games/'+deletable.id,admin,undefined,404);
 await request('DELETE','/admin/users/'+created.id,admin,{version:created.version},204);
 await request('GET','/admin/users/'+created.id,admin,undefined,404);
 await db.user.update({where:{id:sessions.ADMIN.id},data:{role:'USER'}});
 await request('GET','/admin/users',admin,undefined,403);
 await db.user.update({where:{id:sessions.ADMIN.id},data:{role:'ADMIN'}});
 if(process.env.ADMIN_MANAGEMENT_SESSION_FILE)await writeFile(process.env.ADMIN_MANAGEMENT_SESSION_FILE,JSON.stringify(sessions),{mode:0o600});
 console.log('PASS disposable real API:27 role denials, user CRUD/search/filters, password replacement, account lock revokes sessions/login, stale/concurrent writes, self protection, origin protection, all-owner games, publication guard/reset, deletion constraints, fresh role revocation.');
}finally{await db.$disconnect();}
