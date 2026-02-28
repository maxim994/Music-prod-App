type GridProps = {
  bars: number;
  resolution: number;
};

export function Grid({ bars, resolution }: GridProps) {
  const safeResolution = Math.max(1 / 16, resolution);
  const unitsPerBar = Math.max(1, Math.round(1 / safeResolution));
  const totalColumns = Math.max(1, bars * unitsPerBar);
  const columnStyle = { gridTemplateColumns: `repeat(${totalColumns}, minmax(0, 1fr))` };
  const labelStyle = { gridTemplateColumns: `repeat(${bars}, minmax(0, 1fr))` };

  return (
    <div className="grid" style={columnStyle}>
      <div className="grid__labels" style={labelStyle}>
        {Array.from({ length: bars }, (_, index) => (
          <div key={`label-${index}`} className="grid__label">
            {index + 1}
          </div>
        ))}
      </div>
      {Array.from({ length: totalColumns }, (_, index) => (
        <div
          key={index}
          className={`grid__line ${(index + 1) % unitsPerBar === 0 ? "grid__line--major" : "grid__line--minor"}`}
        />
      ))}
    </div>
  );
}
