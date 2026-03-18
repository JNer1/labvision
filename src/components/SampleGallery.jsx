export default function SampleGallery({ cls, onDeleteThumb, onClear }) {
  if (!cls) {
    return (
      <p className="font-mono text-xs text-ink2 italic text-center py-6 px-4">
        Select a class to view its samples.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 p-3 min-h-[60px] max-h-[130px] overflow-y-auto">
        {cls.thumbs.length === 0 ? (
          <p className="font-mono text-xs text-ink2 italic w-full text-center py-2">
            No samples yet — capture some from the camera.
          </p>
        ) : (
          cls.thumbs.map((url, i) => (
            <button
              key={i}
              onClick={() => onDeleteThumb(i)}
              title="Click to delete this sample"
              className="w-12 h-12 border border-rule hover:border-ember transition-colors
                         overflow-hidden flex-shrink-0 group relative"
            >
              <img src={url} alt={`sample ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-ember/70 opacity-0 group-hover:opacity-100
                              transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-mono">✕</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-rule px-3 py-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-ink2 tracking-wide">
          {cls.thumbs.length} sample{cls.thumbs.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="font-mono text-[10px] tracking-wider px-2 py-1 border border-rule
                     text-ink2 hover:bg-ink hover:text-paper hover:border-ink transition-colors uppercase"
        >
          Clear All
        </button>
      </div>
    </div>
  )
}
