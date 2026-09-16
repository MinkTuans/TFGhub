import { describe, expect, it } from 'vitest';
import { AdminCategoryInput, AdminCategoryUpdateInput, AdminDocumentInput, AdminDocumentUpdateInput, AdminDeleteInput, AdminDocumentsQuery } from './admin-library.js';

describe('admin library input boundary', () => {
  it('trims names and rejects empty/oversized categories', () => {
    expect(AdminCategoryInput.parse({name:'  Hướng dẫn  ',description:''}).name).toBe('Hướng dẫn');
    for(const name of ['', '   ', 'x'.repeat(101)]) expect(AdminCategoryInput.safeParse({name}).success).toBe(false);
    expect(AdminCategoryInput.safeParse({name:'A',description:'x'.repeat(501)}).success).toBe(false);
  });
  it('accepts Markdown content without changing it and bounds its size', () => {
    const input={categoryId:'category', title:' Tài liệu ',content:'\n# Heading\n\n<script>text only</script>\n'};
    expect(AdminDocumentInput.parse(input)).toEqual({...input,title:'Tài liệu'});
    expect(AdminDocumentInput.safeParse({...input,content:'x'.repeat(200001)}).success).toBe(false);
    expect(AdminDocumentInput.safeParse({...input,title:'x'.repeat(201)}).success).toBe(false);
    expect(AdminDocumentInput.safeParse({...input,categoryId:''}).success).toBe(false);
  });
  it('rejects provenance, executable configuration and other undeclared client fields', () => {
    for(const extra of [{sourcePath:'/etc/passwd'},{id:'chosen-id'},{role:'ADMIN'}])
      expect(AdminDocumentInput.safeParse({categoryId:'a',title:'A',content:'',...extra}).success).toBe(false);
  });
  it('requires positive integer versions on updates and deletes', () => {
    for(const version of [undefined,0,-1,1.5,'1',2147483647]) {
      expect(AdminDeleteInput.safeParse({version}).success).toBe(false);
      expect(AdminCategoryUpdateInput.safeParse({name:'A',description:'',version}).success).toBe(false);
      expect(AdminDocumentUpdateInput.safeParse({categoryId:'a',title:'A',content:'',version}).success).toBe(false);
    }
    expect(AdminDeleteInput.parse({version:1})).toEqual({version:1});
  });
  it('coerces only bounded pagination and rejects unknown search parameters', () => {
    expect(AdminDocumentsQuery.parse({})).toEqual({query:'',offset:0,limit:50});
    expect(AdminDocumentsQuery.parse({query:' hi ',offset:'50',limit:'100'})).toEqual({query:'hi',offset:50,limit:100});
    for(const input of [{offset:-1},{offset:100001},{limit:0},{limit:101},{query:'x'.repeat(201)},{path:'/etc/passwd'}])
      expect(AdminDocumentsQuery.safeParse(input).success).toBe(false);
  });
});
