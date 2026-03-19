export default function Panel({ title, badge, children, className = "" }) {
  return (
    <div
      className={`bg-paper border border-ink shadow-[3px_3px_0_#1c1612] ${className}`}
    >
      <div className="flex items-center justify-between bg-ink px-3 py-2">
        <span className="font-mono text-paper text-[10px] tracking-[3px] uppercase">
          {title}
        </span>
        {badge && (
          <span className="font-mono text-[9px] tracking-wide bg-ember text-white px-2 py-0.5">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
