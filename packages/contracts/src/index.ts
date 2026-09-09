export { LoginInput, RegisterInput } from './auth.js';
export { DeveloperProfileInput } from './developers.js';
// Studio uses the same canonical validation and mutation reducer as the API.
export {
  EngineProjectV2,
  applyProjectMutations,
  applyProjectMutationsWithHistory,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from '@indieforge/engine-core';
export { CreateEngineGameInput } from './studio-projects.js';
export type { CreateEngineGameResponse } from './studio-projects.js';
export {
  ApplyMutationBatchInput,
  JSON_REQUEST_BYTE_LIMIT,
  mutationBatchRequestBytes,
  EngineProjectReadResponse,
  EngineProjectRevisionSummary,
  ProjectRevisionConflictResponse,
  SaveEngineProjectInput,
} from './engine-projects.js';
export type {
  EngineProjectReadResponse as EngineProjectReadResponseType,
  EngineProjectRevisionSummary as EngineProjectRevisionSummaryType,
  ProjectRevisionConflictResponse as ProjectRevisionConflictResponseType,
  SaveEngineProjectInput as SaveEngineProjectInputType,
} from './engine-projects.js';
export {
  CodeProjectInput,
  CreateGameInput,
  DiscoverGamesInput,
  DiscoverGamesResponse,
  GameProjectInput,
  GameReviewState,
  GameSourceType,
  GameSummary,
  PlatformerProjectInput,
  PublicGameSummary,
  ReviewGameInput,
  ReviewRevisionInput,
  StoryProjectInput,
  UpdateGameInput,
} from './games.js';
export type {
  CodeProjectInput as CodeProjectInputType,
  GameProjectInput as GameProjectInputType,
  GameReviewState as GameReviewStateType,
  GameSourceType as GameSourceTypeType,
  PlatformerProjectInput as PlatformerProjectInputType,
  ReviewGameInput as ReviewGameInputType,
  ReviewRevisionInput as ReviewRevisionInputType,
  StoryProjectInput as StoryProjectInputType,
} from './games.js';
