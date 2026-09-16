export default function Loading() {
  return (
    <main className="page-loading" aria-label="Đang tải nội dung">
      <p role="status">Đang tải nội dung…</p>
      <div role="region" aria-busy="true" aria-label="Nội dung đang tải">
        <div aria-hidden="true">
        <div className="skeleton page-loading__title" />
        <div className="skeleton page-loading__description" />
        <div className="grid catalog-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton page-loading__card" key={index} />
          ))}
        </div>
        </div>
      </div>
    </main>
  );
}
