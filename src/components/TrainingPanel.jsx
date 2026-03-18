export default function TrainingPanel({
  classes, totalSamples, isTrained, isTraining,
  trainLog, progress, trainTag,
  onTrain, onReset, onSave, onLoad,
}) {
  const canTrain = classes.length >= 2 && classes.every((c) => c.samples.length >= 3)

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { num: totalSamples, label: 'Total Samples' },
          { num: classes.length,  label: 'Classes'       },
        ].map(({ num, label }) => (
          <div key={label} className="bg-sand border border-rule p-3 text-center">
            <div className="font-display text-3xl font-bold text-ember leading-none">{num}</div>
            <div className="font-mono text-[9px] text-ink2 tracking-[2px] uppercase mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Log */}
      <p className="font-mono text-[10px] text-ink2 italic leading-relaxed min-h-[2.5rem]">
        {trainLog}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 bg-rule w-full overflow-hidden">
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
          className="flex-1 font-mono text-xs tracking-wider uppercase py-2.5 px-4
                     bg-forest border border-forest text-white
                     hover:bg-[#1e5438] disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors"
        >
          {isTraining ? '⟳ Training…' : '▶ Train Model'}
        </button>
        <button
          onClick={onReset}
          disabled={!isTrained}
          className="font-mono text-[10px] tracking-wider uppercase py-2 px-3
                     border border-rule text-ink2
                     hover:bg-ink hover:text-paper hover:border-ink
                     disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Save / Load */}
      <div className="flex gap-2 pt-1 border-t border-rule">
        <button
          onClick={onSave}
          disabled={!isTrained}
          className="font-mono text-[10px] tracking-wider uppercase py-1.5 px-3
                     border border-rule text-ink2
                     hover:bg-ink hover:text-paper hover:border-ink
                     disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ↓ Save Model
        </button>
        <label className="font-mono text-[10px] tracking-wider uppercase py-1.5 px-3
                          border border-rule text-ink2 cursor-pointer
                          hover:bg-ink hover:text-paper hover:border-ink transition-colors">
          ↑ Load Model
          <input type="file" accept=".json" className="hidden" onChange={onLoad} />
        </label>
      </div>
    </div>
  )
}
