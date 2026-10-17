export function CompoundUsageChart({ items }: { items: { id: string; label: string; count: number; color: string; badgeClass?: string }[] }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.count, 0))
  let offset = 0
  return <div className="tyre-usage-content">
    <svg aria-label="tyre compound usage" className="tyre-donut" viewBox="0 0 42 42">
      <circle className="tyre-donut-base" cx="21" cy="21" fill="none" r="15.9" strokeWidth="6" />
      {items.map(item => {
        const share = item.count / total * 100, dashOffset = -offset
        offset += share
        return <circle key={item.id} cx="21" cy="21" fill="none" r="15.9" stroke={item.color} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={dashOffset} strokeWidth="6" transform="rotate(-90 21 21)" />
      })}
    </svg>
    <div className="tyre-usage-legend">{items.map(item => <div key={item.id}><span className={`broadcast-tire ${item.badgeClass ?? ''}`} style={{color:item.color}}>{item.id}</span><span>{item.label}</span><strong>{item.count}</strong><small>{Math.round(item.count / total * 100)}%</small></div>)}</div>
  </div>
}
