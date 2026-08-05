type Item = { label: string; value: number };

export function DistributionBars({ items }: { items: Item[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="distribution-bars" data-slot="distribution-bars">
      {items.map((item, index) => {
        const percentage = total ? Math.round((item.value / total) * 100) : 0;
        const relativeWidth = Math.max(item.value ? 8 : 0, Math.round((item.value / max) * 100));
        return (
          <div className="distribution-row" key={item.label} data-tone={index % 5}>
            <div className="distribution-label"><span>{item.label}</span><strong>{item.value} <small>({percentage}%)</small></strong></div>
            <div className="distribution-track" aria-label={`${item.label}: ${item.value}`}>
              <span style={{ width: `${relativeWidth}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
