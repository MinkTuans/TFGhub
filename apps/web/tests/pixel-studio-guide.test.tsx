import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PixelStudioGuide } from "../components/pixel-studio-guide";

test("documentation exposes every implemented topic with search and article navigation", () => {
  render(<PixelStudioGuide />);
  expect(screen.getByRole("textbox", { name: "Tìm trong tài liệu" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: /Collision|Va chạm/ }).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByRole("textbox", { name: "Tìm trong tài liệu" }), {
    target: { value: "va chạm" },
  });
  expect(screen.getByRole("button", { name: /Va chạm/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Âm thanh" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Va chạm/ }));
  expect(screen.getByRole("heading", { name: /Va chạm/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Bài tiếp theo" })).toBeVisible();
});
