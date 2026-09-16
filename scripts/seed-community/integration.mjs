import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '../../packages/database/generated/client/index.js';
import {ArtifactStorage} from '../../apps/api/dist/game-artifacts/artifact-storage.js';
import {compileCode} from '../../apps/api/dist/game-artifacts/code-compiler.js';
import {seedCommunity,definitions} from './seed.mjs';
import {createDataset} from './data.mjs';
const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
assert.equal(url.pathname,'/community_seed_test');assert(['localhost','127.0.0.1'].includes(url.hostname));
const data=createDataset(await definitions()),db=new PrismaClient();
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));const argon2=require('argon2');
const options={secret:'community-seed-disposable-signing-secret',storage:new ArtifactStorage(process.env.GAME_STORAGE_ROOT),compile:compileCode,hashPassword:value=>argon2.hash(value,{type:argon2.argon2id})};
try{
 const sentinel=await db.user.create({data:{id:'nonseed-sentinel',email:'existing@example.test',passwordHash:'untouched-existing-hash',role:'USER'}});
 // Partial identity collision must refuse without installing anything or modifying data.
 await db.user.create({data:{id:data.users[0].id,email:data.users[0].email,passwordHash:'collision',role:'USER'}});
 await assert.rejects(seedCommunity(db,data,options),/Partial\/colliding/);assert.equal(await db.game.count(),0);
 await db.user.delete({where:{id:data.users[0].id}});
 // A failed transaction leaves no DB seed rows; identical immutable files are safe to reuse.
 await assert.rejects(seedCommunity(db,data,{...options,hashPassword:async()=>{throw Error('Intentional hash failure')}}),/Intentional/);
 assert.equal(await db.game.count(),0);assert.equal(await db.user.count(),1);
 const results=await Promise.all([seedCommunity(db,data,options),seedCommunity(db,data,options)]);
 assert.equal(results.filter(r=>r.seeded).length,1);assert.equal(results.filter(r=>!r.seeded).length,1);
 assert.equal(await db.user.count(),31);assert.equal(await db.game.count(),10);assert.equal(await db.gamePlay.count(),280);assert.equal(await db.gameScore.count(),280);assert.equal(await db.gameRating.count(),46);assert.equal(await db.gameComment.count(),46);
 assert.deepEqual(await db.user.findUnique({where:{id:sentinel.id}}),sentinel);
 const hashes=await db.user.findMany({where:{id:{in:data.users.map(u=>u.id)}},select:{passwordHash:true}});assert.equal(new Set(hashes.map(h=>h.passwordHash)).size,30);assert(hashes.every(h=>h.passwordHash.startsWith('$argon2id$')));
 await db.developerProfile.update({where:{userId:data.users[0].id},data:{bio:'Edited after seed'}});
 assert.equal((await seedCommunity(db,data,options)).seeded,false);assert.equal((await db.developerProfile.findUnique({where:{userId:data.users[0].id}})).bio,'Edited after seed');
 const play=data.plays[0];await db.gamePlay.update({where:{id:play.id},data:{userId:sentinel.id}});
 await assert.rejects(seedCommunity(db,data,options),/Seed relation collision/);await db.gamePlay.update({where:{id:play.id},data:{userId:play.userId}});
 const emptyRoot=await mkdtemp(join(tmpdir(),'community-missing-artifact-'));
 await assert.rejects(seedCommunity(db,data,{...options,storage:new ArtifactStorage(emptyRoot)}));
 assert.equal(await db.user.count(),31);assert.equal(await db.gamePlay.count(),280);
 console.log('PASS fresh/concurrent/repeated seed; rollback and immutable artifact retry; partial collision, foreign relation and missing artifact rejection; existing user and subsequent edits preserved; exact 30/10/280/46/46 counts; 30 independent Argon2id hashes.');
}finally{await db.$disconnect();}
