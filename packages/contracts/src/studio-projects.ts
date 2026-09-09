import { z } from "zod";
import type { GameSummary } from "./games.js";
import type { EngineProjectReadResponse } from "./engine-projects.js";

export const CreateEngineGameInput = z.object({
  title: z.string().trim().min(1).max(80).default("Game chưa có tên"),
});

export type CreateEngineGameInput = z.infer<typeof CreateEngineGameInput>;
export type CreateEngineGameResponse = {
  game: GameSummary;
  project: EngineProjectReadResponse;
};
