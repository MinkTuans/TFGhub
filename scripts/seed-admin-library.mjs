import {readdir, readFile} from 'node:fs/promises';
import {resolve, join, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

export const libraryCategories = {
  '01-project': 'Tổng quan dự án',
  '02-architecture': 'Kiến trúc hệ thống',
  '03-features': 'Tính năng website',
  '04-workflows': 'Hướng dẫn và quy trình',
  '05-api': 'Tài liệu API',
  '06-database': 'Cơ sở dữ liệu',
  '07-ai': 'Hướng dẫn trợ lý lập trình',
  '08-rules': 'Quy tắc phát triển và bảo mật',
  '09-development': 'Phát triển và kiểm thử',
  '10-deployment': 'Triển khai và sao lưu',
  '11-history': 'Lịch sử cập nhật và báo cáo',
  '12-reference': 'Cấu hình và tra cứu',
};
const defaultDocsRoot = fileURLToPath(new URL('../docs', import.meta.url));

export async function collectLibraryDocuments(docsRoot = defaultDocsRoot) {
  const documents = [];
  async function walk(directory) {
    const entries = await readdir(directory, {withFileTypes:true});
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const source = relative(docsRoot, absolute).split(sep).join('/');
      const section = source.split('/')[0];
      const categoryKey = section === 'superpowers' ? '11-history' : (source === 'README.md' ? '01-project' : section);
      if (!Object.hasOwn(libraryCategories, categoryKey)) continue;
      if (entry.isDirectory()) await walk(absolute);
      // Symlinks and all non-Markdown files are excluded, even under docs.
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const content = await readFile(absolute,'utf8');
      if (content.length > 200000) throw new Error(`Document exceeds 200000 characters: docs/${source}`);
      const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const title = (heading || entry.name.replace(/\.md$/, '')).slice(0,200);
      documents.push({categoryKey, title, content, sourcePath:`docs/${source}`});
    }
  }
  await walk(resolve(docsRoot));
  return documents;
}

export async function seedAdminLibrary(database, docsRoot = defaultDocsRoot) {
  return database.$transaction(async tx => {
    // Serializes concurrent deploy attempts before inspecting the durable marker.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741926031)`;
    if (await tx.adminLibraryState.findUnique({where:{id:'project-docs-v1'}}))
      return {seeded:false,categories:0,documents:0};
    const documents = await collectLibraryDocuments(docsRoot);
    if (!documents.length) throw new Error('No project documents found; library seed aborted');
    const ids = new Map();
    for (const [key,name] of Object.entries(libraryCategories)) {
      const category = await tx.adminCategory.create({data:{id:randomUUID(),name}});
      ids.set(key,category.id);
    }
    await tx.adminDocument.createMany({data:documents.map(({categoryKey,...document})=>({
      id:randomUUID(),categoryId:ids.get(categoryKey),...document,
    }))});
    await tx.adminLibraryState.create({data:{id:'project-docs-v1'}});
    return {seeded:true,categories:ids.size,documents:documents.length};
  }, {timeout:30000,maxWait:30000});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {PrismaClient} = await import('../packages/database/generated/client/index.js');
  const database = new PrismaClient();
  try { console.log(JSON.stringify(await seedAdminLibrary(database))); }
  finally { await database.$disconnect(); }
}
