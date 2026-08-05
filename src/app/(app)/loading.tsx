export default function Loading() {
  return (
    <div className="loading-page" role="status" aria-label="Đang tải dữ liệu">
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="loading-stat-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton loading-stat" key={index} />)}
      </div>
      <div className="skeleton loading-panel" />
    </div>
  );
}
