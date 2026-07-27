interface RevenueTrendChartProps {
  labels: string[];
  current: number[];
  previous: number[];
  mode: 'bar' | 'line';
  height?: number;
}

const formatCompact = (amount: number) => {
  if (amount >= 1000) {
    const val = amount / 1000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}k`;
  }
  return `${Math.round(amount)}`;
};

export function RevenueTrendChart({ labels, current, previous, mode, height = 180 }: RevenueTrendChartProps) {
  const hasData = current.some((v) => v > 0) || previous.some((v) => v > 0);
  const max = hasData ? Math.max(...current, ...previous) : 0;
  const ticks = hasData ? [1, 0.75, 0.5, 0.25, 0].map((f) => max * f) : [0, 0, 0, 0, 0];
  const chartWidth = 700;
  const scale = max || 1;

  const pointsFor = (series: number[]) =>
    series
      .map((v, i) => {
        const x = labels.length > 1 ? (i / (labels.length - 1)) * chartWidth : 0;
        const y = height - (v / scale) * height;
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: '44px 1fr' }}
    >
      <div className="flex flex-col justify-between text-right font-mono text-[10px] leading-none text-muted-foreground" style={{ height }}>
        {ticks.map((t, i) => (
          <span key={i}>NRs{formatCompact(t)}</span>
        ))}
      </div>

      <div className="min-w-0">
        <div className="relative border-b border-border" style={{ height }}>
          {mode === 'bar' ? (
            <div className="flex h-full items-end justify-between gap-2 px-1">
              {labels.map((label, i) => (
                <div key={label + i} className="flex h-full flex-1 items-end justify-center gap-[3px]">
                  <div
                    className="w-full max-w-3 rounded-t-[3px] bg-zinc-900 transition-[height] dark:bg-teal-400"
                    style={{ height: `${Math.max((current[i] / scale) * 100, current[i] > 0 ? 2 : 0)}%` }}
                    title={`This week: NRs ${Math.round(current[i]).toLocaleString('en-IN')}`}
                  />
                  <div
                    className="w-full max-w-3 rounded-t-[3px] bg-zinc-300 transition-[height] dark:bg-zinc-700"
                    style={{ height: `${Math.max((previous[i] / scale) * 100, previous[i] > 0 ? 2 : 0)}%` }}
                    title={`Last week: NRs ${Math.round(previous[i]).toLocaleString('en-IN')}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${chartWidth} ${height}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              {ticks.map((_, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={chartWidth}
                  y1={(height / (ticks.length - 1)) * i}
                  y2={(height / (ticks.length - 1)) * i}
                  className="text-border"
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={0.6}
                />
              ))}
              <polyline
                points={pointsFor(previous)}
                fill="none"
                className="text-zinc-300 dark:text-zinc-700"
                stroke="currentColor"
                strokeWidth={2}
              />
              <polyline
                points={pointsFor(current)}
                fill="none"
                className="text-zinc-900 dark:text-teal-400"
                stroke="currentColor"
                strokeWidth={2}
              />
              {current.map((v, i) => {
                const x = labels.length > 1 ? (i / (labels.length - 1)) * chartWidth : 0;
                const y = height - (v / scale) * height;
                return <circle key={i} cx={x} cy={y} r={3} className="fill-zinc-900 dark:fill-teal-400" />;
              })}
            </svg>
          )}
        </div>
        <div
          className="mt-2 grid text-center text-[11px] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}
        >
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
