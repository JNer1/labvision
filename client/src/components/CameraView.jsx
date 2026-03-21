import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

const CameraView = forwardRef(function CameraView(
  { mode, isTrained, onCapture, selectedClass },
  ref,
) {
  const videoRef = useRef(null);
  const captureRef = useRef(null);
  const streamRef = useRef(null);
  const flashRef = useRef(null);

  useImperativeHandle(ref, () => ({
    async startCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      return stream;
    },
    stopCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    },
    getVideo: () => videoRef.current,
    getCapture: () => captureRef.current,
    hasStream: () => !!streamRef.current,
    triggerFlash() {
      if (!flashRef.current) return;
      flashRef.current.style.opacity = "0.7";
      setTimeout(() => {
        if (flashRef.current) flashRef.current.style.opacity = "0";
      }, 120);
    },
  }));

  return (
    <div className="relative bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="block aspect-[4/3] w-full object-cover"
      />
      <canvas ref={captureRef} className="hidden" />

      {/* Flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-100"
        style={{ opacity: 0 }}
      />

      {/* Scan line in predict mode */}
      {mode === "predict" && isTrained && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="scan-line" />
        </div>
      )}

      {/* Corner brackets */}
      {[
        "top-2 left-2 border-t-2 border-l-2",
        "top-2 right-2 border-t-2 border-r-2",
        "bottom-2 left-2 border-b-2 border-l-2",
        "bottom-2 right-2 border-b-2 border-r-2",
      ].map((cls, i) => (
        <div key={i} className={`absolute h-5 w-5 border-ember/60 ${cls}`} />
      ))}
    </div>
  );
});

export default CameraView;
