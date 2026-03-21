export default function SampleGallery({ cls, onDeleteThumb, onClear }) {
  if (!cls) {
    return (
      <p className="px-4 py-6 text-center font-mono text-xs italic text-ink2">
        Select a class to view its samples.
      </p>
    );
  }

  return (
    <div>
      <div className="flex max-h-[130px] min-h-[60px] flex-wrap gap-1.5 overflow-y-auto p-3">
        {cls.thumbs.length === 0 ? (
          <p className="w-full py-2 text-center font-mono text-xs italic text-ink2">
            No samples yet — capture some from the camera.
          </p>
        ) : (
          cls.thumbs.map((url, i) => (
            <button
              key={i}
              onClick={() => onDeleteThumb(i)}
              title="Click to delete this sample"
              className="group relative h-12 w-12 flex-shrink-0 overflow-hidden border border-rule transition-colors hover:border-ember"
            >
              <img
                src={url}
                alt={`sample ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-ember/70 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="font-mono text-xs text-white">✕</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-rule px-3 py-2">
        <span className="font-mono text-[10px] tracking-wide text-ink2">
          {cls.thumbs.length} sample{cls.thumbs.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onClear}
          className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink2 transition-colors hover:border-ink hover:bg-ink hover:text-paper"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
