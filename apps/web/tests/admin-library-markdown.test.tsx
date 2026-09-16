import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MarkdownReader, sourceLink } from "../components/admin-library/markdown-reader";
test("markdown keeps formatting and strips unsafe HTML and links", () => {
 const { container } = render(<MarkdownReader sourcePath="docs/start.md" onSourceLink={vi.fn()} content={'# Hướng dẫn\n\n<script>alert(1)</script>\n\n[Không an toàn](javascript:alert%281%29)\n\n[Protocol](//evil.test)\n\n[Website](https://example.test)\n\n| Cột | Giá trị |\n| --- | --- |\n| A | B |\n\n```js\nconst x = 1;\n```'} />);
 expect(screen.getByRole("heading", { name: "Hướng dẫn" })).toBeVisible();
 expect(container.querySelector("script")).toBeNull();
 expect(screen.queryByRole("link", { name: "Không an toàn" })).not.toBeInTheDocument();
 expect(screen.queryByRole("link", { name: "Protocol" })).not.toBeInTheDocument();
 expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("rel", "noopener noreferrer");
 expect(screen.getByRole("region", { name: "Bảng tài liệu" })).toBeVisible();
 expect(container.querySelector("pre code")).toHaveTextContent("const x = 1;");
});
test("source-relative links resolve only inside imported docs", () => {
 expect(sourceLink("../05-api/README.md#routes", "docs/01-project/overview.md")).toBe("docs/05-api/README.md");
 expect(sourceLink("../../private.md", "docs/README.md")).toBeNull();
 expect(sourceLink("https://evil.test/x.md", "docs/README.md")).toBeNull();
 const follow = vi.fn(); render(<MarkdownReader sourcePath="docs/01-project/overview.md" onSourceLink={follow} content="[API](../05-api/README.md)" />);
 fireEvent.click(screen.getByRole("link", { name: "API" }));
 expect(follow).toHaveBeenCalledWith("docs/05-api/README.md");
});
