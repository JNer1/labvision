export default function TrainingPanel({
  classes,
  totalSamples,
  isTrained,
  isTraining,
  trainLog,
  progress,
  trainTag,
  onTrain,
  onReset,
  onSave,
  onLoad,
}) {
  const canTrain =
    classes.length >= 2 && classes.every((c) => (c.thumbs?.length ?? 0) >= 3);

  return (
    <div className="space-y-4 p-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { num: totalSamples, label: "Total Samples" },
          { num: classes.length, label: "Classes" },
        ].map(({ num, label }) => (
          <div
            key={label}
            className="border border-rule bg-sand p-3 text-center"
          >
            <div className="font-display text-3xl font-bold leading-none text-ember">
              {num}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-ink2">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Log */}
      <p className="min-h-[2.5rem] font-mono text-[10px] italic leading-relaxed text-ink2">
        {trainLog}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden bg-rule">
        <div
          className="h-full bg-forest transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onTrain}
          disabled={!canTrain || isTraining}
          className="flex-1 border border-forest bg-forest px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-[#1e5438] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isTraining ? "⟳ Training…" : "▶ Train Model"}
        </button>
        <button
          onClick={onReset}
          disabled={!isTrained}
          className="border border-rule px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink2 transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
        >
          Reset
        </button>
      </div>

      {/* Save / Load */}
      <div className="flex gap-2 border-t border-rule pt-1">
        <button
          onClick={onSave}
          disabled={!isTrained}
          className="border border-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink2 transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
        >
          ↓ Save Model
        </button>
        <label className="cursor-pointer border border-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink2 transition-colors hover:border-ink hover:bg-ink hover:text-paper">
          ↑ Load Model
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={onLoad}
          />
        </label>
      </div>
    </div>
  );
}
