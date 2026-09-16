import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./library.module.css";

export function sourceLink(href: string, sourcePath: string | null): string | null {
  if (!sourcePath || !href || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(href)) return null;
  try {
    const resolved = new URL(href, `https://library.invalid/${sourcePath}`);
    const path = decodeURIComponent(resolved.pathname.slice(1));
    return path.startsWith("docs/") && path.endsWith(".md") ? path : null;
  } catch { return null; }
}
export function MarkdownReader({ content, sourcePath, onSourceLink }: { content: string; sourcePath: string | null; onSourceLink: (path: string) => void }) {
  return <div className={styles.markdown}><Markdown remarkPlugins={[remarkGfm]} skipHtml
    urlTransform={(url) => /^(https?:\/\/|#)/i.test(url) || sourceLink(url, sourcePath) ? url : ""}
    components={{
      a: ({ href, children }) => {
        const path = sourceLink(href ?? "", sourcePath);
        if (path) return <a data-library-source="true" href={`/admin/library?sourcePath=${encodeURIComponent(path)}`} onClick={(event) => { event.preventDefault(); onSourceLink(path); }}>{children}</a>;
        if (href && /^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        if (href?.startsWith("#")) return <a href={href}>{children}</a>;
        return <span>{children}</span>;
      },
      img: ({ alt }) => <span>{alt ? `[Hình ảnh: ${alt}]` : "[Hình ảnh]"}</span>,
      table: ({ children }) => <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Bảng tài liệu"><table>{children}</table></div>,
    }}>{content || "*Chưa có nội dung.*"}</Markdown></div>;
}
