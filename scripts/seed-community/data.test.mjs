import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataset,gameSpecs,summarize} from './data.mjs';
const definitions=gameSpecs.map(s=>({key:s.key,title:s.key,genre:s.key,instructions:'Fixture',project:{sourceType:'CODE',html:'',css:'',javascript:''},scoreSamples:[0,10,30,50],durationSeconds:[35,280]}));
test('30 natural profiles; uneven 4–7 game memberships cover every account; source aggregates agree',()=>{
 const d=createDataset(definitions),summary=summarize(d);
 assert.equal(d.users.length,30);assert.equal(d.games.length,10);assert.equal(d.plays.length,280);assert.equal(d.ratings.length,46);assert.equal(d.comments.length,46);
 assert.equal(new Set(d.users.map(x=>x.email)).size,30);assert(d.users.every(x=>x.displayName.split(' ').length>=3&&x.email.endsWith('@seed.tfg.example')));
 const activity=d.users.map(u=>new Set(d.plays.filter(p=>p.userId===u.id).map(p=>p.gameId)).size);assert(activity.every(n=>n>0));assert(Math.max(...activity)>=5);assert(activity.includes(1)&&activity.includes(2)&&activity.includes(3));
 assert.equal(new Set(d.comments.map(x=>x.body)).size,46);assert.deepEqual(new Set(d.ratings.map(x=>x.rating)),new Set([2,3,4,5]));
 assert.equal(new Set(d.ratings.map(x=>x.userId+':'+x.gameId)).size,46);
 for(const [i,game] of d.games.entries()){
  const spec=gameSpecs[i],s=summary[i];assert.equal(s.participants,spec.people.length);assert(s.participants>=4&&s.participants<=7);assert.equal(s.totalPlays,spec.plays);assert.equal(s.commentCount,spec.comments.length);
  const owner=d.users.find(u=>u.id===game.ownerId);assert(owner&&Date.parse(owner.createdAt)<Date.parse(game.createdAt));
  for(const p of d.plays.filter(p=>p.gameId===game.id)){assert(d.users.some(u=>u.id===p.userId));assert(Date.parse(p.createdAt)>Date.parse(game.createdAt));assert(Date.parse(p.lastHeartbeatAt)<=Date.parse(p.expiresAt));assert.equal(d.scores.filter(s=>s.playId===p.id).length,1);}
  for(const c of d.comments.filter(c=>c.gameId===game.id)){assert(d.plays.some(p=>p.userId===c.userId&&p.gameId===c.gameId&&Date.parse(p.createdAt)<Date.parse(c.createdAt)));assert(c.userId!==game.ownerId);}
 }
 assert.deepEqual(createDataset(definitions),d,'Dataset is reproducible');
});
