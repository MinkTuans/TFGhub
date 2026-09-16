import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RouteError from "../app/error";
import GlobalError from "../app/global-error";
import Loading from "../components/page-loading";

const failure = new Error("private server diagnostic must not be rendered");

test("route errors offer retry without exposing server diagnostics", () => {
  const retry = vi.fn();
  render(<RouteError error={failure} retry={retry} />);
  expect(screen.getByRole("heading", { level: 1, name: "Không thể tải trang lúc này" })).toBeVisible();
  expect(screen.queryByText(failure.message)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
});

test("root layout errors provide their own document and recovery", () => {
  const retry = vi.fn();
  const document = GlobalError({ error: failure, retry });
  expect(document.type).toBe("html");
  expect(document.props.lang).toBe("vi");
  const body = document.props.children;
  expect(body.type).toBe("body");
  render(body.props.children);
  expect(screen.queryByText(failure.message)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("loading announces progress without exposing decorative skeletons", () => {
  render(<Loading />);
  expect(screen.getByRole("status").closest('[aria-busy="true"]')).toBeNull();
  expect(screen.getByLabelText("Nội dung đang tải")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Đang tải nội dung");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
