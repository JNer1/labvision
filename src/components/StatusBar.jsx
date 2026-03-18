export default function StatusBar({ status, message }) {
  const dotColor =
    status === 'ready'   ? 'bg-forest shadow-[0_0_6px_#2a6e4a]' :
    status === 'loading' ? 'bg-amber animate-blink' :
    status === 'error'   ? 'bg-red-500' :
                           'bg-rule'

  return (
    <div className="relative z-10 flex items-center gap-3 bg-ink text-amber px-4 py-2 font-mono text-xs tracking-widest uppercase mb-6">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="truncate">{message}</span>
    </div>
  )
}
