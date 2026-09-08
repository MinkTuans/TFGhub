import Link from "next/link";

export default function NotFound() {
  return (
    <main className="narrow">
      <header className="page-heading">
        <p className="eyebrow">404</p>
        <h1>Không tìm thấy trang</h1>
      </header>
      <p>Trang bạn tìm có thể đã được chuyển hoặc không còn tồn tại.</p>
      <Link className="button" href="/">Về trang chủ</Link>
    </main>
  );
}
