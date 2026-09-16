"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="moderation-page"><h1>Chưa thể mở thư viện</h1><p role="alert">Vui lòng kiểm tra kết nối và quyền quản trị, rồi thử lại.</p><button onClick={reset}>Thử lại</button></main>; }
