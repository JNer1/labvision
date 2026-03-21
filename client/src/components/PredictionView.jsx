export default function PredictionView({ prediction, classes }) {
  if (!prediction || classes.length === 0) {
    return (
      <p className="px-4 py-6 text-center font-mono text-xs italic text-ink2">
        Train a model and switch to Predict mode.
      </p>
    );
  }

  // prediction is { [classDbId]: probability }
  const sorted = Object.entries(prediction)
    .map(([id, p]) => ({
      id: parseInt(id),
      p,
      cls: classes.find((c) => c.id === parseInt(id)),
    }))
    .filter((x) => x.cls)
    .sort((a, b) => b.p - a.p);

  if (sorted.length === 0) {
    return (
      <p className="px-4 py-6 text-center font-mono text-xs italic text-ink2">
        No predictions yet.
      </p>
    );
  }

  const top = sorted[0];

  return (
    <div>
      {/* Top prediction */}
      <div className="border-b border-rule px-4 py-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[3px] text-ink2">
          Best Match
        </div>
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 flex-shrink-0 rounded-full"
            style={{ background: top.cls.color }}
          />
          <span className="truncate font-display text-xl font-bold italic text-ink">
            {top.cls.name}
          </span>
          <span className="ml-auto font-mono text-sm font-bold text-ember">
            {Math.round(top.p * 100)}%
          </span>
        </div>
      </div>

      {/* All classes */}
      <div className="divide-y divide-rule">
        {sorted.map(({ id, p, cls }) => (
          <div key={id} className="flex items-center gap-2 px-4 py-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: cls.color }}
            />
            <span className="flex-1 truncate font-mono text-xs">
              {cls.name}
            </span>
            <div className="h-1 w-20 flex-shrink-0 bg-rule">
              <div
                className="h-full bg-forest transition-all duration-300"
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
            <span className="w-8 flex-shrink-0 text-right font-mono text-[10px] text-ember">
              {Math.round(p * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
