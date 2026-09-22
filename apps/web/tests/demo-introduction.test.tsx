import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
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

