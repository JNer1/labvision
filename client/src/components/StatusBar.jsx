export default function StatusBar({ status, message }) {
  const dotColor =
    status === "ready"
      ? "bg-forest shadow-[0_0_6px_#2a6e4a]"
      : status === "loading"
        ? "bg-amber animate-blink"
        : status === "error"
          ? "bg-red-500"
          : "bg-rule";

  return (
    <div className="relative z-10 mb-6 flex items-center gap-3 bg-ink px-4 py-2 font-mono text-xs uppercase tracking-widest text-amber">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
      <span className="truncate">{message}</span>
    </div>
  );
}
