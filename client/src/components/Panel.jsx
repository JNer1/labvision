export default function Panel({ title, badge, children, className = "" }) {
  return (
    <div
      className={`border border-ink bg-paper shadow-[3px_3px_0_#1c1612] ${className}`}
    >
      <div className="flex items-center justify-between bg-ink px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[3px] text-paper">
          {title}
        </span>
        {badge && (
          <span className="bg-ember px-2 py-0.5 font-mono text-[9px] tracking-wide text-white">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
