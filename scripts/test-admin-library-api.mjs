import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PrismaClient} from '../packages/database/generated/client/index.js';
const databaseUrl=new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
assert.equal(databaseUrl.pathname,'/admin_library_test','Use only disposable admin_library_test');
const base=process.env.ADMIN_LIBRARY_API_URL ?? 'http://127.0.0.1:3221';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const db=new PrismaClient();
const password='AdminLibrary-test123!';
async function request(method,path,cookie,body,expected=200,extraHeaders={}) {
 const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extraHeaders},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();
 assert.equal(response.status,expected,`${method} ${path}: ${text}`);
 return {data:text?JSON.parse(text):undefined,headers:response.headers};
}
try{
 const sessions={};
 for(const role of ['USER','MODERATOR','ADMIN']){
  const email=`library-${role.toLowerCase()}@admin-library.test`;
  let response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert([201,409].includes(response.status));
  await db.user.update({where:{email},data:{role}});
  response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(response.status,200);
  sessions[role]={email,password,cookie:response.headers.get('set-cookie').split(';')[0]};
 }
 const admin=sessions.ADMIN.cookie;
 for(const cookie of [undefined,sessions.USER.cookie,sessions.MODERATOR.cookie]){
  for(const [method,path,body] of [
   ['GET','/categories'],['POST','/categories',{name:'No'}],['PATCH','/categories/none',{name:'No',version:1}],['DELETE','/categories/none',{version:1}],
   ['GET','/documents'],['GET','/documents/none'],['POST','/documents',{categoryId:'none',title:'No',content:''}],['PATCH','/documents/none',{categoryId:'none',title:'No',content:'',version:1}],['DELETE','/documents/none',{version:1}],
  ])await request(method,'/admin/library'+path,cookie,body,cookie?403:401);
 }
 const categories=(await request('GET','/admin/library/categories',admin)).data;
 assert(categories.length>=12);
 const list=await request('GET','/admin/library/documents?limit=2',admin);
 assert.match(list.headers.get('cache-control'),/private, no-store/);
 assert.equal(list.data.items.length,2);assert(list.data.total>2);
 assert(list.data.items.every(x=>!Object.hasOwn(x,'content')));
 const source=await request('GET','/admin/library/documents?sourcePath=docs%2FREADME.md',admin);
 assert.equal(source.data.items.length,1);
 const category=(await request('POST','/admin/library/categories',admin,{name:'Kiểm thử CRUD',description:'Temporary test category'},201)).data;
 const doc=(await request('POST','/admin/library/documents',admin,{categoryId:category.id,title:'Tài liệu CRUD',content:'# Nội dung\n\nUniqueNeedle2026'},201)).data;
 assert.equal(doc.sourcePath,null);
 const found=(await request('GET','/admin/library/documents?query=uniqueneedle2026',admin)).data;
 assert.equal(found.items[0].id,doc.id);
 await request('DELETE','/admin/library/categories/'+category.id,admin,{version:1},409);
 await request('PATCH','/admin/library/documents/'+doc.id,admin,{categoryId:category.id,title:'Invalid',content:'',version:1,sourcePath:'/etc/passwd'},400);
 const races=await Promise.all(['First writer','Second writer'].map(title=>fetch(base+'/admin/library/documents/'+doc.id,{method:'PATCH',headers:{Cookie:admin,'Content-Type':'application/json'},body:JSON.stringify({categoryId:category.id,title,content:'Saved',version:1})})));
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 const updated=(await request('GET','/admin/library/documents/'+doc.id,admin)).data;
 assert.equal(updated.version,2);assert.equal(updated.content,'Saved');
 await request('DELETE','/admin/library/documents/'+doc.id,admin,{version:1},409);
 await request('POST','/admin/library/categories',admin,{name:'Cross origin'},403,{Origin:'https://evil.example'});
 const changedCategory=(await request('PATCH','/admin/library/categories/'+category.id,admin,{name:'Đã sửa',description:'Updated',version:1})).data;
 assert.equal(changedCategory.version,2);
 await request('DELETE','/admin/library/documents/'+doc.id,admin,{version:2},204);
 await request('GET','/admin/library/documents/'+doc.id,admin,undefined,404);
 await request('DELETE','/admin/library/categories/'+category.id,admin,{version:2},204);
 await db.user.update({where:{email:sessions.ADMIN.email},data:{role:'USER'}});
 await request('GET','/admin/library/categories',admin,undefined,403);
 await db.user.update({where:{email:sessions.ADMIN.email},data:{role:'ADMIN'}});
 if(process.env.ADMIN_LIBRARY_SESSION_FILE) await writeFile(process.env.ADMIN_LIBRARY_SESSION_FILE,JSON.stringify(sessions),{mode:0o600});
 console.log('PASS real PostgreSQL/API role matrix (27 denials), seeded list/source search, CRUD, content search, concurrent update200/409, stale delete, nonempty category, provenance rejection, origin enforcement and fresh role revocation.');
}finally{await db.$disconnect();}
