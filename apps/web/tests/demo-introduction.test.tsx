import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DemoIntroduction } from "../components/demo-introduction";

afterEach(() => {
  localStorage.clear();
});

test("opens on the first browser visit and moves to feature highlights", async () => {
  render(<DemoIntroduction />);

  expect(await screen.findByRole("dialog", { name: "Giới thiệu TFG" })).toBeVisible();
  expect(screen.getByText("Nền tảng trò chơi độc lập")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Slide 2: Tính năng chính" }));

  expect(screen.getByRole("heading", { name: "Tính năng chính" })).toBeVisible();
  expect(screen.getByText("Tạo game Pixel trong Studio")).toBeVisible();
});

test("records dismissal and does not reopen in the same browser", async () => {
  const view = render(<DemoIntroduction />);
  await screen.findByRole("dialog", { name: "Giới thiệu TFG" });

  fireEvent.click(screen.getByRole("button", { name: "Đóng giới thiệu" }));

  expect(localStorage.getItem("tfg-demo-introduction-seen")).toBe("true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  render(<DemoIntroduction />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("supports Escape, arrow keys, and discovery from the final slide", async () => {
  render(<DemoIntroduction />);
  const dialog = await screen.findByRole("dialog", { name: "Giới thiệu TFG" });

  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  fireEvent.keyDown(dialog, { key: "ArrowRight" });

  expect(screen.getByRole("link", { name: "Khám phá website" })).toHaveAttribute("href", "/discover");
  fireEvent.keyDown(dialog, { key: "ArrowLeft" });
  expect(screen.getByRole("heading", { name: "Biến ý tưởng thành trò chơi" })).toBeVisible();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("remains usable when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage is unavailable", "SecurityError");
  });

  render(<DemoIntroduction />);

  expect(await screen.findByRole("dialog", { name: "Giới thiệu TFG" })).toBeVisible();
});
