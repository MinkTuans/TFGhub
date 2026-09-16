import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectLibraryDocuments} from './seed-admin-library.mjs';

test('imports only regular Markdown from supported documentation sections with provenance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tfg-doc-seed-'));
 try{
  await mkdir(join(root,'01-project'));
  await writeFile(join(root,'README.md'),'# Tổng quan\n\nNội dung');
  await writeFile(join(root,'01-project','guide.md'),'# Hướng dẫn\n\n|A|B|\n|-|-|');
  await writeFile(join(root,'01-project','secret.env'),'secret');
  await symlink(join(root,'README.md'),join(root,'01-project','linked.md'));
  const docs=await collectLibraryDocuments(root);
  assert.equal(docs.length,2);
  assert.deepEqual(docs.map(x=>x.sourcePath).sort(),['docs/01-project/guide.md','docs/README.md']);
  assert.equal(docs.find(x=>x.sourcePath.endsWith('guide.md')).title,'Hướng dẫn');
  assert(docs.every(x=>x.categoryKey==='01-project'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('rejects documents that exceed editable limits rather than silently truncating content',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tfg-doc-seed-'));
 try{
  await writeFile(join(root,'README.md'),'x'.repeat(200001));
  await assert.rejects(()=>collectLibraryDocuments(root),/200000/);
 }finally{await rm(root,{recursive:true,force:true});}
});
