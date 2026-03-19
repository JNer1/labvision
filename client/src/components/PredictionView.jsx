export default function PredictionView({ prediction, classes }) {
  if (!prediction || classes.length === 0) {
    return (
      <p className="font-mono text-xs text-ink2 italic text-center py-6 px-4">
        Train a model and switch to Predict mode.
      </p>
    );
  }

  const sorted = Object.entries(prediction.probs)
    .map(([i, p]) => ({ i: parseInt(i), p, cls: classes[parseInt(i)] }))
    .filter((x) => x.cls)
    .sort((a, b) => b.p - a.p);

  const top = sorted[0];

  return (
    <div>
      {/* Top prediction */}
      <div className="px-4 py-4 border-b border-rule">
        <div className="font-mono text-[10px] text-ink2 tracking-[3px] uppercase mb-1">
          Best Match
        </div>
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: top?.cls?.color }}
          />
          <span className="font-display text-xl italic font-bold text-ink truncate">
            {top?.cls?.name ?? "—"}
          </span>
          <span className="ml-auto font-mono text-sm font-bold text-ember">
            {Math.round((top?.p ?? 0) * 100)}%
          </span>
        </div>
      </div>

      {/* All classes */}
      <div className="divide-y divide-rule">
        {sorted.map(({ i, p, cls }) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: cls.color }}
            />
            <span className="flex-1 font-mono text-xs truncate">
              {cls.name}
            </span>
            <div className="w-20 h-1 bg-rule flex-shrink-0">
              <div
                className="h-full bg-forest transition-all duration-300"
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-ember w-8 text-right flex-shrink-0">
              {Math.round(p * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
