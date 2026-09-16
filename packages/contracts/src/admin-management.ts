import { z } from 'zod';
import { RegisterInput } from './auth.js';
import { GameReviewState, GameSourceType } from './games.js';

const role = z.enum(['USER', 'MODERATOR', 'ADMIN']);
const visibility = z.enum(['DRAFT', 'PUBLIC', 'UNLISTED']);
const moderationState = z.enum(['CLEAR', 'FLAGGED', 'QUARANTINED']);
const accessMode = z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']);
const paging = {
  query: z.string().trim().max(200).default(''),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};
export const AdminUsersQuery = z.object({ ...paging, role: role.optional(), active: z.enum(['true', 'false']).optional() }).strict();
export const AdminGamesQuery = z.object({ ...paging, ownerId: z.string().min(1).max(128).optional(), visibility: visibility.optional(), moderationState: moderationState.optional(), reviewState: GameReviewState.optional() }).strict();
const userFields = {
  email: RegisterInput.shape.email,
  password: RegisterInput.shape.password,
  displayName: z.string().trim().min(2).max(50),
  role,
  isActive: z.boolean(),
};
export const AdminUserCreateInput = z.object({ ...userFields, displayName: userFields.displayName.optional(), role: role.default('USER'), isActive: z.boolean().default(true) }).strict();
export const AdminUserUpdateInput = z.object(userFields).partial().extend({ version: z.number().int().positive() }).strict().refine(value => Object.keys(value).some(key => key !== 'version'), 'At least one change is required');
export const AdminUserDeleteInput = z.object({ version: z.number().int().positive() }).strict();
export const AdminGameUpdateInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000),
  accessMode,
  visibility,
  moderationState,
}).partial().extend({ updatedAt: z.string().datetime({ offset: true }) }).strict().refine(value => Object.keys(value).some(key => key !== 'updatedAt'), 'At least one change is required');
export const AdminGameDeleteInput = z.object({ updatedAt: z.string().datetime({ offset: true }) }).strict();

export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;
export type AdminGamesQuery = z.infer<typeof AdminGamesQuery>;
export type AdminUserCreateInput = z.infer<typeof AdminUserCreateInput>;
export type AdminUserUpdateInput = z.infer<typeof AdminUserUpdateInput>;
export type AdminUserDeleteInput = z.infer<typeof AdminUserDeleteInput>;
export type AdminGameUpdateInput = z.infer<typeof AdminGameUpdateInput>;
export type AdminGameDeleteInput = z.infer<typeof AdminGameDeleteInput>;
export type AdminManagedUser = {
  id: string; email: string; role: z.infer<typeof role>; isActive: boolean; version: number;
  displayName: string | null; gameCount: number; createdAt: string;
};
export type AdminManagedGame = {
  id: string; ownerId: string; ownerEmail: string; ownerName: string | null;
  title: string; slug: string; description: string; visibility: z.infer<typeof visibility>;
  moderationState: z.infer<typeof moderationState>; accessMode: z.infer<typeof accessMode>;
  sourceType: z.infer<typeof GameSourceType>; reviewState: z.infer<typeof GameReviewState>;
  artifactReady: boolean; artifactVersion: number; submittedAt: string | null;
  createdAt: string; updatedAt: string; buildCount: number; releaseCount: number;
};
export type AdminManagedUserList = { items: AdminManagedUser[]; total: number };
export type AdminManagedGameList = { items: AdminManagedGame[]; total: number };
