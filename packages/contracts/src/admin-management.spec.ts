import { describe, expect, it } from 'vitest';
import { AdminUsersQuery, AdminGamesQuery, AdminUserCreateInput, AdminUserUpdateInput, AdminUserDeleteInput, AdminGameUpdateInput, AdminGameDeleteInput } from './admin-management.js';

describe('admin management contracts', () => {
 it('normalizes admin-created accounts and applies password policy', () => {
  const value=AdminUserCreateInput.parse({email:' USER@Example.test ',password:'Abcdef1!',displayName:' Creator '});
  expect(value).toMatchObject({email:'user@example.test',role:'USER',isActive:true,displayName:'Creator'});
  expect(AdminUserCreateInput.safeParse({email:'a@example.test',password:'password123'}).success).toBe(false);
 });
 it('bounds search and paging and validates filters', () => {
  expect(AdminUsersQuery.parse({})).toEqual({query:'',offset:0,limit:10});
  expect(AdminGamesQuery.parse({offset:'10',limit:'10',visibility:'DRAFT'})).toMatchObject({offset:10,limit:10,visibility:'DRAFT'});
  for(const schema of [AdminUsersQuery,AdminGamesQuery]) {
   for(const value of [{limit:0},{limit:51},{offset:-1},{query:'x'.repeat(201)},{unknown:'x'}]) expect(schema.safeParse(value).success).toBe(false);
  }
  expect(AdminUsersQuery.safeParse({active:'no'}).success).toBe(false);
  expect(AdminGamesQuery.safeParse({reviewState:'READY'}).success).toBe(false);
 });
 it('requires user concurrency tokens and meaningful safe fields', () => {
  expect(AdminUserUpdateInput.parse({version:1,isActive:false})).toEqual({version:1,isActive:false});
  for(const value of [{version:0,role:'ADMIN'},{role:'ADMIN'},{version:1},{version:1,passwordHash:'hash'},{version:1,password:'weak'}]) expect(AdminUserUpdateInput.safeParse(value).success).toBe(false);
  expect(AdminUserDeleteInput.safeParse({version:1}).success).toBe(true);
  expect(AdminUserDeleteInput.safeParse({version:0}).success).toBe(false);
 });
 it('allows game management fields without revision/publication mutation', () => {
  const updatedAt='2026-09-16T00:00:00.000Z';
  expect(AdminGameUpdateInput.parse({updatedAt,moderationState:'QUARANTINED'})).toEqual({updatedAt,moderationState:'QUARANTINED'});
  for(const value of [{updatedAt},{updatedAt,title:''},{updatedAt,sourceType:'CODE'},{updatedAt,artifactReady:true},{updatedAt,currentPublishedReleaseId:'x'},{updatedAt,ownerId:'x'},{updatedAt:'invalid',title:'Title'}]) expect(AdminGameUpdateInput.safeParse(value).success).toBe(false);
  expect(AdminGameDeleteInput.safeParse({updatedAt}).success).toBe(true);
  expect(AdminGameDeleteInput.safeParse({}).success).toBe(false);
 });
});
