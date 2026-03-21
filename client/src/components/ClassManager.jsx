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
      <div className="max-h-72 divide-y divide-rule overflow-y-auto">
        {classes.length === 0 && (
          <p className="px-4 py-6 text-center font-mono text-xs italic text-ink2">
            No classes yet. Add one below.
          </p>
        )}
        {classes.map((cls, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`group flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
              selectedClass === i
                ? "border-l-2 border-ember bg-ember/10"
                : "border-l-2 border-transparent hover:bg-sand"
            }`}
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: cls.color }}
            />
            <span className="flex-1 truncate font-mono text-xs font-medium">
              {cls.name}
            </span>
            <span className="font-mono text-[10px] tracking-wide text-ink2">
              {cls.sample_count} samples
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
              className="ml-1 border border-rule px-1.5 py-0.5 font-mono text-[10px] text-ink2 opacity-0 transition-all hover:border-ink hover:bg-ink hover:text-paper group-hover:opacity-100"
            >
              ✕
            </span>
          </button>
        ))}
      </div>

      {/* Add new class */}
      <div className="flex gap-2 border-t border-ink p-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="e.g. Staphylococcus"
          maxLength={40}
          className="flex-1 border border-rule bg-sand px-2.5 py-2 font-mono text-xs text-ink placeholder:text-ink2/50 focus:border-ember focus:outline-none"
        />
        <button
          onClick={handleAdd}
          className="border border-ink px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-ink hover:text-paper"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
