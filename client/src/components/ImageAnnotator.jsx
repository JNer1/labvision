import {
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";

const MIN_SIZE = 20;
const HANDLE_SIZE = 10;

const ImageAnnotator = forwardRef(function ImageAnnotator(
  { selectedClass, classes },
  ref,
) {
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [box, setBox] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const dragStart = useRef(null);
  const resizing = useRef(false);
  const currentBox = useRef(null);

  const updateBox = useCallback((b) => {
    currentBox.current = b;
    setBox(b);
  }, []);

  const currentImage = queue[queueIdx] ?? null;

  // ── Expose API to parent ───────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getCrop() {
      const b = currentBox.current;
      const img = imageRef.current;
      const canvas = canvasRef.current;
      if (!b || !img || !canvas) return null;

      const scaleX = img.naturalWidth / canvas.clientWidth;
      const scaleY = img.naturalHeight / canvas.clientHeight;

      const crop = cropCanvasRef.current;
      crop.width = 224;
      crop.height = 224;
      crop
        .getContext("2d")
        .drawImage(
          img,
          b.x * scaleX,
          b.y * scaleY,
          b.w * scaleX,
          b.h * scaleY,
          0,
          0,
          224,
          224,
        );
      return crop;
    },
    getCropDataUrl() {
      const crop = this.getCrop();
      return crop ? crop.toDataURL("image/jpeg", 0.7) : null;
    },
    clearBox: () => updateBox(null),
    hasBox: () => !!currentBox.current,
    hasImage: () => !!imageRef.current && !!currentBox.current,
    goNext() {
      setQueueIdx((i) => Math.min(i + 1, queue.length - 1));
      updateBox(null);
    },
    goPrev() {
      setQueueIdx((i) => Math.max(i - 1, 0));
      updateBox(null);
    },
    queueLength: () => queue.length,
    queueIdx: () => queueIdx,
  }));

  // ── Load image when queue item changes ────────────────────────────────────
  useEffect(() => {
    if (!currentImage) {
      imageRef.current = null;
      setImageLoaded(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = currentImage.url;
    updateBox(null);
  }, [currentImage, updateBox]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = imageRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!img || !imageLoaded) return;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const b = currentBox.current;
    if (!b) return;

    // Dim outside box
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      (b.x / canvas.clientWidth) * img.naturalWidth,
      (b.y / canvas.clientHeight) * img.naturalHeight,
      (b.w / canvas.clientWidth) * img.naturalWidth,
      (b.h / canvas.clientHeight) * img.naturalHeight,
      b.x,
      b.y,
      b.w,
      b.h,
    );

    // Dashed box border
    ctx.strokeStyle = "#c8410a";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);

    // Corner brackets
    const corners = [
      [b.x, b.y, 1, 1],
      [b.x + b.w, b.y, -1, 1],
      [b.x, b.y + b.h, 1, -1],
      [b.x + b.w, b.y + b.h, -1, -1],
    ];
    ctx.strokeStyle = "#c8410a";
    ctx.lineWidth = 2;
    corners.forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 10, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * 10);
      ctx.stroke();
    });

    // SE resize handle
    ctx.fillStyle = "#c8410a";
    ctx.fillRect(
      b.x + b.w - HANDLE_SIZE / 2,
      b.y + b.h - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE,
    );

    // Dimensions label
    ctx.fillStyle = "#c8410a";
    ctx.font = "10px monospace";
    ctx.fillText(`${Math.round(b.w)} × ${Math.round(b.h)}`, b.x + 4, b.y - 5);
  }, [box, imageLoaded]);

  // ── File upload ────────────────────────────────────────────────────────────
  function handleFiles(files) {
    const items = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, url: URL.createObjectURL(f), name: f.name }));
    if (items.length === 0) return;
    setQueue((prev) => [...prev, ...items]);
    setQueueIdx(0);
    updateBox(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  // ── Pointer coords ─────────────────────────────────────────────────────────
  function relCoords(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitHandle(pos, b) {
    if (!b) return false;
    return (
      Math.abs(pos.x - (b.x + b.w)) <= HANDLE_SIZE &&
      Math.abs(pos.y - (b.y + b.h)) <= HANDLE_SIZE
    );
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  function onPointerDown(e) {
    if (!imageLoaded) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    const pos = relCoords(e);
    if (currentBox.current && hitHandle(pos, currentBox.current)) {
      resizing.current = true;
    } else {
      resizing.current = false;
      updateBox(null);
    }
    dragStart.current = pos;
  }

  function onPointerMove(e) {
    if (!dragStart.current) return;
    const pos = relCoords(e);
    const W = canvasRef.current.clientWidth;
    const H = canvasRef.current.clientHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (resizing.current && currentBox.current) {
      const b = currentBox.current;
      updateBox({
        ...b,
        w: clamp(pos.x - b.x, MIN_SIZE, W - b.x),
        h: clamp(pos.y - b.y, MIN_SIZE, H - b.y),
      });
    } else {
      const x = clamp(Math.min(pos.x, dragStart.current.x), 0, W);
      const y = clamp(Math.min(pos.y, dragStart.current.y), 0, H);
      const w = clamp(Math.abs(pos.x - dragStart.current.x), 0, W - x);
      const h = clamp(Math.abs(pos.y - dragStart.current.y), 0, H - y);
      updateBox({ x, y, w, h });
    }
  }

  function onPointerUp() {
    const b = currentBox.current;
    if (b && (b.w < MIN_SIZE || b.h < MIN_SIZE)) updateBox(null);
    dragStart.current = null;
    resizing.current = false;
  }

  function updateCursor(e) {
    if (!imageLoaded || !canvasRef.current) return;
    canvasRef.current.style.cursor =
      currentBox.current && hitHandle(relCoords(e), currentBox.current)
        ? "se-resize"
        : "crosshair";
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (queue.length === 0) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById("img-upload").click()}
        className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed border-rule bg-sand transition-colors hover:border-ember hover:bg-ember/5"
      >
        <input
          id="img-upload"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="text-5xl opacity-20">📁</div>
        <div className="text-center font-mono text-xs uppercase leading-relaxed tracking-widest text-ink2">
          Drop images here
          <br />
          or click to upload
        </div>
        <div className="font-mono text-[10px] text-ink2/60">
          JPG · PNG · TIFF — multiple files supported
        </div>
      </div>
    );
  }

  // ── Canvas view ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="relative bg-black">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="block aspect-[4/3] w-full"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            onPointerMove(e);
            updateCursor(e);
          }}
          onPointerUp={onPointerUp}
        />
        <canvas ref={cropCanvasRef} className="hidden" />

        {imageLoaded && !box && (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="bg-black/50 px-2 py-1 font-mono text-[10px] tracking-wider text-white/70">
              DRAG TO DRAW BOUNDING BOX
            </span>
          </div>
        )}
      </div>

      {/* Queue navigation */}
      <div className="flex items-center gap-2 border-t border-ink bg-sand px-3 py-2">
        <button
          onClick={() => {
            setQueueIdx((i) => Math.max(i - 1, 0));
            updateBox(null);
          }}
          disabled={queueIdx === 0}
          className="border border-rule px-2 py-1 font-mono text-xs transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
        >
          ←
        </button>
        <span className="flex-1 truncate text-center font-mono text-[10px] tracking-wide text-ink2">
          {currentImage?.name} &nbsp;({queueIdx + 1} / {queue.length})
        </span>
        <button
          onClick={() => {
            setQueueIdx((i) => Math.min(i + 1, queue.length - 1));
            updateBox(null);
          }}
          disabled={queueIdx === queue.length - 1}
          className="border border-rule px-2 py-1 font-mono text-xs transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
        >
          →
        </button>
        <button
          onClick={() => document.getElementById("img-upload-more").click()}
          className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink2 transition-colors hover:border-ink hover:bg-ink hover:text-paper"
        >
          + Add
        </button>
        <input
          id="img-upload-more"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
});

export default ImageAnnotator;
