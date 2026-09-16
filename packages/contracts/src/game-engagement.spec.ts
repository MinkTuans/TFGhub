import { describe, expect, it } from "vitest";
import * as contracts from "./index.js";
describe("engagement inputs", () => {
  it("exports strict bounded schemas", () => {
    expect(contracts).toHaveProperty("gameRatingInputSchema");
    const c = contracts as unknown as Record<
      string,
      { safeParse: (v: unknown) => { success: boolean } }
    >;
    for (const rating of [0, 6, 1.5, "5"])
      expect(c.gameRatingInputSchema.safeParse({ rating }).success).toBe(false);
    expect(c.gameRatingInputSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(
      c.gameCommentInputSchema.safeParse({ body: " ".repeat(10) }).success,
    ).toBe(false);
    expect(
      c.gameCommentInputSchema.safeParse({ body: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      c.playHeartbeatInputSchema.safeParse({
        token: "x".repeat(43),
        sequence: 1,
        activeSeconds: 31,
      }).success,
    ).toBe(false);
    expect(
      c.gameScoreInputSchema.safeParse({
        token: "x".repeat(43),
        score: 2147483648,
      }).success,
    ).toBe(false);
    expect(
      c.gameScoreInputSchema.safeParse({
        token: "x".repeat(43),
        score: 1,
        userId: "injected",
      }).success,
    ).toBe(false);
  });
});
