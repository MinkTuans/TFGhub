import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "@indieforge/contracts";

import { UploadEditor } from "../components/upload-editor";
import { uploadGame } from "../lib/game-upload";

vi.mock("../lib/game-upload", () => ({ uploadGame: vi.fn() }));

const readyGame = {
  id: "game-1",
  artifactReady: true,
  artifactVersion: 1,
} as GameSummary;

afterEach(() => {
  vi.mocked(uploadGame).mockReset();
});

describe("UploadEditor", () => {
  it("shows selected ZIP metadata before starting transfer", () => {
    render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);
    const archive = new File(["123456"], "forest-quest.zip", {
      type: "application/zip",
    });

    fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
      target: { files: [archive] },
    });

    expect(screen.getByText(/Đã chọn: forest-quest\.zip \(6 B\)/)).toBeVisible();
  });

  it("rejects an unsupported file before it starts an upload", () => {
    render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
      target: { files: [new File(["plain"], "forest-quest.html")] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Chọn tệp .zip để tải lên.");
    expect(screen.getByRole("button", { name: "Tải trò chơi lên" })).toBeDisabled();
    expect(uploadGame).not.toHaveBeenCalled();
  });

  it("shows byte-derived progress and waits for server acceptance", async () => {
    let resolveUpload!: (game: GameSummary) => void;
    let callbacks!: Parameters<typeof uploadGame>[2];
    vi.mocked(uploadGame).mockImplementation((_gameId, _archive, received) => {
      callbacks = received;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      }) as ReturnType<typeof uploadGame>;
    });
    render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);
    const archive = new File(["zip"], "forest-quest.zip", {
      type: "application/zip",
    });
    fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
      target: { files: [archive] },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Tải trò chơi lên" }).closest("form")!);

    act(() => callbacks.onProgress({ loaded: 1024, total: 2048 }));
    expect(await screen.findByRole("progressbar")).toHaveAttribute("value", "1024");
    expect(screen.getByRole("status")).toHaveTextContent("50%");

    act(() => callbacks.onTransferred());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đã gửi tệp. Đang chờ máy chủ kiểm tra…",
    );
    expect(screen.queryByText("Đã tải lên. Bản chơi thử đã sẵn sàng.")).not.toBeInTheDocument();

    await act(async () => resolveUpload(readyGame));
    expect(await screen.findByText("Đã tải lên. Bản chơi thử đã sẵn sàng.")).toBeVisible();
  });

  it("keeps progress indeterminate when the browser cannot report totals", () => {
    let callbacks!: Parameters<typeof uploadGame>[2];
    vi.mocked(uploadGame).mockImplementation((_gameId, _archive, received) => {
      callbacks = received;
      return new Promise(() => {}) as ReturnType<typeof uploadGame>;
    });
    render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
      target: { files: [new File(["zip"], "forest-quest.zip")] },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Tải trò chơi lên" }).closest("form")!);

    act(() => callbacks.onIndeterminate());

    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải forest-quest.zip…");
    expect(screen.getByRole("status")).not.toHaveTextContent("%");
  });

  it("explains that a replacement must be submitted again", async () => {
    let resolveUpload!: (game: GameSummary) => void;
    vi.mocked(uploadGame).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }) as ReturnType<typeof uploadGame>,
    );
    render(
      <UploadEditor gameId="game-1" artifactVersion={2} onUploaded={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Tệp ZIP HTML5"), {
      target: { files: [new File(["zip"], "replacement.zip")] },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Tải trò chơi lên" }).closest("form")!);

    await act(async () => resolveUpload(readyGame));

    expect(screen.getByText(/Bản mới đang ở trạng thái Bản nháp/)).toBeVisible();
  });
});
