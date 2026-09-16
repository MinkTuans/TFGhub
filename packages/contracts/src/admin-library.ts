import { z } from 'zod';

const version = z.number().int().min(1).max(2147483646);
const identifier = z.string().trim().min(1).max(128);
export const AdminCategoryInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(''),
}).strict();
export type AdminCategoryInput = z.infer<typeof AdminCategoryInput>;
export const AdminCategoryUpdateInput = AdminCategoryInput.extend({version}).strict();
export type AdminCategoryUpdateInput = z.infer<typeof AdminCategoryUpdateInput>;
export const AdminDocumentInput = z.object({
  categoryId: identifier,
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200000),
}).strict();
export type AdminDocumentInput = z.infer<typeof AdminDocumentInput>;
export const AdminDocumentUpdateInput = AdminDocumentInput.extend({version}).strict();
export type AdminDocumentUpdateInput = z.infer<typeof AdminDocumentUpdateInput>;
export const AdminDeleteInput = z.object({version}).strict();
export type AdminDeleteInput = z.infer<typeof AdminDeleteInput>;
export const AdminDocumentsQuery = z.object({
  query: z.string().trim().max(200).default(''),
  categoryId: identifier.optional(),
  sourcePath: z.string().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export type AdminDocumentsQuery = z.infer<typeof AdminDocumentsQuery>;

export type AdminCategory = {
  id: string; name: string; description: string; version: number;
  documentCount: number; createdAt: string; updatedAt: string;
};
export type AdminDocumentSummary = {
  id: string; categoryId: string; title: string; sourcePath: string | null;
  version: number; createdAt: string; updatedAt: string;
};
export type AdminDocument = AdminDocumentSummary & {content: string};
export type AdminDocumentList = {items: AdminDocumentSummary[]; total: number};
