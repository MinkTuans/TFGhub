import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no optional native canvas backend. Most UI tests exercise the
// unavailable-context path; drawing tests supply the boundary recorder and
// browser e2e exercises actual Chrome Canvas2D pixels.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(cleanup);
