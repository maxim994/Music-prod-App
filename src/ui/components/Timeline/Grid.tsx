type GridProps = {
  bars: number;
};

export function Grid({ bars }: GridProps) {
  const columnStyle = { gridTemplateColumns: `repeat(${bars}, 1fr)` };
  return (
    <div className="grid" style={columnStyle}>
      <div className="grid__labels" style={columnStyle}>
        {Array.from({ length: bars }, (_, index) => (
          <div key={`label-${index}`} className="grid__label">
            {index + 1}
          </div>
        ))}
      </div>
      {Array.from({ length: bars }, (_, index) => (
        <div key={index} className="grid__line" />
      ))}
    </div>
  );
}
