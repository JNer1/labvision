import { useState } from "react";

const COLORS = [
  "#c8410a",
  "#2a6e4a",
  "#1a4a7a",
  "#7a2a6e",
  "#6e7a2a",
  "#2a4a6e",
  "#c86e0a",
  "#0a6ec8",
];

export default function ClassManager({
  classes,
  selectedClass,
  onSelect,
  onAdd,
  onDelete,
}) {
  const [name, setName] = useState("");

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (classes.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert("Class already exists.");
      return;
    }
    onAdd({
      name: trimmed,
      color: COLORS[classes.length % COLORS.length],
      samples: [],
      thumbs: [],
    });
    setName("");
  }

  return (
    <div>
      {/* Class list */}
      <div className="max-h-72 overflow-y-auto divide-y divide-rule">
        {classes.length === 0 && (
          <p className="font-mono text-xs text-ink2 italic text-center py-6 px-4">
            No classes yet. Add one below.
          </p>
        )}
        {classes.map((cls, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors group
              ${
                selectedClass === i
                  ? "bg-ember/10 border-l-2 border-ember"
                  : "hover:bg-sand border-l-2 border-transparent"
              }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: cls.color }}
            />
            <span className="flex-1 font-mono text-xs font-medium truncate">
              {cls.name}
            </span>
            <span className="font-mono text-[10px] text-ink2 tracking-wide">
              {cls.sample_count} samples
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
              className="font-mono text-[10px] text-ink2 px-1.5 py-0.5 border border-rule
                         opacity-0 group-hover:opacity-100 hover:bg-ink hover:text-paper
                         hover:border-ink transition-all ml-1"
            >
              ✕
            </span>
          </button>
        ))}
      </div>

      {/* Add new class */}
      <div className="flex gap-2 p-3 border-t border-ink">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="e.g. Staphylococcus"
          maxLength={40}
          className="flex-1 font-mono text-xs px-2.5 py-2 border border-rule bg-sand
                     focus:outline-none focus:border-ember text-ink placeholder:text-ink2/50"
        />
        <button
          onClick={handleAdd}
          className="font-mono text-xs tracking-wider px-3 py-2 border border-ink
                     hover:bg-ink hover:text-paper transition-colors uppercase"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
