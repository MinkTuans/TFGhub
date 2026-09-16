import assert from 'node:assert/strict';
import {PrismaClient} from '../packages/database/generated/client/index.js';
import {seedAdminLibrary,collectLibraryDocuments} from './seed-admin-library.mjs';
const url=new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
assert.equal(url.pathname,'/admin_library_test','Run only against disposable admin_library_test database');
const db=new PrismaClient();
try {
 const expected=await collectLibraryDocuments();
 const before=await db.user.findUnique({where:{id:'pre-library-upgrade-user'}});
 assert(before,'Pre-upgrade sentinel user survives additive migration');
 const seeds=await Promise.all([seedAdminLibrary(db),seedAdminLibrary(db)]);
 assert.equal(seeds.filter(s=>s.seeded).length,1,'Concurrent imports seed exactly once');
 assert.equal(await db.adminDocument.count(),expected.length);
 const doc=await db.adminDocument.findFirstOrThrow({where:{sourcePath:'docs/README.md'}});
 const deleted=await db.adminDocument.findFirstOrThrow({where:{id:{not:doc.id}}});
 await db.adminDocument.update({where:{id:doc.id},data:{title:'Admin changed title',content:'Persistent admin content',version:{increment:1}}});
 await db.adminDocument.delete({where:{id:deleted.id}});
 const result=await seedAdminLibrary(db);
 assert.equal(result.seeded,false);
 assert.equal(await db.adminDocument.count(),expected.length-1);
 assert.equal((await db.adminDocument.findUniqueOrThrow({where:{id:doc.id}})).content,'Persistent admin content');
 assert.equal(await db.adminDocument.findUnique({where:{id:deleted.id}}),null);
 await assert.rejects(()=>db.adminCategory.delete({where:{id:doc.categoryId}}),e=>e.code==='P2003');
 // Leave docs restored for browser verification, without erasing the seed marker.
 await db.adminDocument.update({where:{id:doc.id},data:{title:doc.title,content:doc.content}});
 await db.adminDocument.create({data:deleted});
 console.log(`PASS additive upgrade preserves user; ${expected.length} documents imported; concurrent seed once; edits/deletes survive repeat import; category FK restricts deletion.`);
}finally{await db.$disconnect();}
