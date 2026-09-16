import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createDataset,summarize,SEED_VERSION} from './data.mjs';
const runtimeRequire=createRequire(new URL('../../apps/api/package.json',import.meta.url));
export async function definitions(){const [{gamesA},{gamesB}]=await Promise.all([import('./games-a.mjs'),import('./games-b.mjs')]);return [...gamesA,...gamesB];}
export async function seedCommunity(db,data,{secret,storage,compile,hashPassword}){
 assert(secret?.length>=24,'Configured JWT_SECRET required for stable participant identities');
 const userIds=data.users.map(u=>u.id),gameIds=data.games.map(g=>g.id),playIds=data.plays.map(p=>p.id),commentIds=data.comments.map(c=>c.id);
 const digest=value=>createHmac('sha256',secret).update(`engagement:${value}`).digest('base64url');
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(741926032)`;
  const users=await tx.user.findMany({where:{OR:[{id:{in:userIds}},{email:{in:data.users.map(u=>u.email)}}]},select:{id:true,email:true}});
  const games=await tx.game.findMany({where:{OR:[{id:{in:gameIds}},{slug:{in:data.games.map(g=>g.slug)}}]},select:{id:true,slug:true,ownerId:true}});
  const playCount=await tx.gamePlay.count({where:{id:{in:playIds}}}),commentCount=await tx.gameComment.count({where:{id:{in:commentIds}}});
  if(users.length||games.length||playCount||commentCount){
   assert.equal(users.length,30,'Partial/colliding seed accounts; abort without changes');assert.equal(games.length,10,'Partial/colliding seed games; abort without changes');
   for(const user of data.users)assert(users.some(u=>u.id===user.id&&u.email===user.email),'Seed identity collision');
   for(const game of data.games)assert(games.some(g=>g.id===game.id&&g.slug===game.slug&&g.ownerId===game.ownerId),'Seed game collision');
   assert.equal(await tx.developerProfile.count({where:{userId:{in:userIds}}}),30,'Incomplete profiles');
   assert.equal(playCount,data.plays.length,'Incomplete plays');assert.equal(commentCount,data.comments.length,'Incomplete comments');
   assert.equal(await tx.gameScore.count({where:{playId:{in:playIds}}}),data.scores.length,'Incomplete scores');
   assert.equal(await tx.gameRating.count({where:{OR:data.ratings.map(({gameId,userId})=>({gameId,userId}))}}),data.ratings.length,'Incomplete ratings');
   const storedPlays=await tx.gamePlay.findMany({where:{id:{in:playIds}},select:{id:true,gameId:true,userId:true}});
   const storedComments=await tx.gameComment.findMany({where:{id:{in:commentIds}},select:{id:true,gameId:true,userId:true}});
   for(const [expected,actual] of [[data.plays,storedPlays],[data.comments,storedComments]]){
    const rows=new Map(actual.map(row=>[row.id,row]));
    for(const row of expected)assert.deepEqual(rows.get(row.id),{id:row.id,gameId:row.gameId,userId:row.userId},'Seed relation collision');
   }
   assert.equal(await tx.gameCommentCooldown.count({where:{OR:data.comments.map(({gameId,userId})=>({gameId,userId}))}}),data.comments.length,'Incomplete comment cooldowns');
   for(const game of data.games)for(const file of compile(game.projectData)){
    const installed=await storage.read(game.id,1,file.path);
    assert.equal(installed.content.toString(),String(file.content),'Seed artifact missing or changed');assert.equal(installed.contentType,file.contentType);
   }
   return {seeded:false,version:SEED_VERSION,users:30,games:10,plays:playCount,comments:commentCount};
  }
  // Install only brand-new seed artifact IDs. A rolled-back DB attempt may leave
  // an immutable artifact behind; reuse it only after an exact byte comparison.
  for(const game of data.games){
   const files=compile(game.projectData);
   try{await storage.install(game.id,1,files);}catch(error){
    if(error?.constructor?.name!=='ArtifactVersionExistsError')throw error;
    for(const file of files){const installed=await storage.read(game.id,1,file.path);assert.equal(installed.content.toString(),String(file.content),'Artifact collision; never overwrite');assert.equal(installed.contentType,file.contentType);}
   }
  }
  for(const user of data.users){
   const passwordHash=await hashPassword(randomBytes(48).toString('base64url'));
   await tx.user.create({data:{id:user.id,email:user.email,passwordHash,role:'USER',isActive:true,createdAt:user.createdAt,profile:{create:{displayName:user.displayName,bio:user.bio}}}});
  }
  for(const game of data.games){
   const {genre,...row}=game;
   await tx.game.create({data:{...row,sourceType:'CODE',visibility:'PUBLIC',reviewState:'APPROVED',moderationState:'CLEAR',accessMode:'GUEST_ALLOWED',artifactVersion:1,artifactReady:true,scoresEnabled:true,viewportWidth:4,viewportHeight:5,submittedAt:new Date(Date.parse(game.createdAt)+3600000),reviewedAt:new Date(Date.parse(game.createdAt)+7200000),updatedAt:new Date(Date.parse(game.createdAt)+7200000)}});
  }
  await tx.gamePlay.createMany({data:data.plays.map(p=>({...p,participantKey:digest('user:'+p.userId),tokenHash:createHash('sha256').update(randomBytes(48)).digest('hex')}))});
  await tx.gameScore.createMany({data:data.scores});
  await tx.gameRating.createMany({data:data.ratings});
  await tx.gameComment.createMany({data:data.comments});
  await tx.gameCommentCooldown.createMany({data:data.comments.map(c=>({gameId:c.gameId,userId:c.userId,lastCommentAt:c.createdAt}))});
  return {seeded:true,version:SEED_VERSION,users:data.users.length,games:data.games.length,plays:data.plays.length,ratings:data.ratings.length,comments:data.comments.length};
 },{timeout:120000,maxWait:120000});
}
export async function exportDataset(data,directory){
 await mkdir(directory,{recursive:true});
 const summary=summarize(data);
 const userStats=data.users.map(user=>{
  const plays=data.plays.filter(p=>p.userId===user.id),gameIds=[...new Set(plays.map(p=>p.gameId))];
  return {userId:user.id,gamesPlayed:gameIds.length,totalPlays:plays.length,totalPlaySeconds:plays.reduce((a,p)=>a+p.activeSeconds,0),records:gameIds.map(gameId=>{const ids=new Set(plays.filter(p=>p.gameId===gameId).map(p=>p.id));return {gameId,highScore:Math.max(...data.scores.filter(s=>ids.has(s.playId)).map(s=>s.score))};})};
 });
 await writeFile(resolve(directory,'data.json'),JSON.stringify({...data,summary,userStats,schemaNotes:{username:'Export alias derived from email, not a database column',genre:'Stored in Game.description, no category column',revenue:'Not supported; no income or payment records fabricated',avatar:'Not supported',ratingDates:'GameRating has no timestamp; no column added',memberships:'Derived from Game.ownerId and GamePlay, not a new join table'}},null,2)+'\n');
 const table=['| Game | Người tạo | Người tham gia | Lượt chơi | Sao TB | Bình luận |','|---|---|---:|---:|---:|---:|',...summary.map(g=>`| ${g.title} | ${g.creator} | ${g.participants} | ${g.totalPlays} | ${g.ratingAverage.toFixed(2)} | ${g.commentCount} |`)];
 await writeFile(resolve(directory,'overview.md'),'# Bộ dữ liệu mẫu cộng đồng Việt Nam\n\nDữ liệu mô phỏng, không phải người dùng, đánh giá hoặc doanh thu thật.\n\n'+table.join('\n')+'\n\nChi tiết và thống kê tính từ từng bản ghi trong [data.json](data.json). 30 tài khoản dùng email miền mẫu; mật khẩu ngẫu nhiên không được xuất hoặc dùng chung. Không có dữ liệu thanh toán.\n');
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const data=createDataset(await definitions());
 const outputIndex=process.argv.indexOf('--output');
 if(outputIndex!==-1){assert(process.argv[outputIndex+1],'--output requires directory');await exportDataset(data,resolve(process.argv[outputIndex+1]));console.log('Exported synthetic community dataset.');}
 if(process.argv.includes('--apply')){
  const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
  assert.equal(decodeURIComponent(url.pathname.slice(1)),process.env.SEED_EXPECTED_DATABASE,'Explicit target database name required');
  assert.equal(process.env.SEED_CONFIRM,SEED_VERSION,'Explicit dataset confirmation required');
  const {PrismaClient}=await import('../../packages/database/generated/client/index.js');
  const {ArtifactStorage}=await import('../../apps/api/dist/game-artifacts/artifact-storage.js');
  const {compileCode}=await import('../../apps/api/dist/game-artifacts/code-compiler.js');
  const argon2=runtimeRequire('argon2'),db=new PrismaClient();
  try{console.log(JSON.stringify(await seedCommunity(db,data,{secret:process.env.JWT_SECRET,storage:new ArtifactStorage(),compile:compileCode,hashPassword:password=>argon2.hash(password,{type:argon2.argon2id})})));}finally{await db.$disconnect();}
 }else if(outputIndex===-1)console.log('Use --output DIRECTORY for a dataset export, or --apply with explicit target and confirmation.');
}
