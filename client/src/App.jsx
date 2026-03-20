import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";
import { useWebSocket } from "./useWebSocket.js";

import StatusBar from "./components/StatusBar.jsx";
import Panel from "./components/Panel.jsx";
import CameraView from "./components/CameraView.jsx";
import ImageAnnotator from "./components/ImageAnnotator.jsx";
import ClassManager from "./components/ClassManager.jsx";
import SampleGallery from "./components/SampleGallery.jsx";
import TrainingPanel from "./components/TrainingPanel.jsx";
import PredictionView from "./components/PredictionView.jsx";

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [mode, setMode] = useState("annotate");
  const [cameraOn, setCameraOn] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  // Training
  const [isTrained, setIsTrained] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [trainLog, setTrainLog] = useState(
    "Add at least 2 classes with 3+ samples each.",
  );
  const [progress, setProgress] = useState(0);
  const [trainTag, setTrainTag] = useState("IDLE");

  // Prediction
  const [prediction, setPrediction] = useState(null);

  // Status
  const [appStatus, setAppStatus] = useState({
    status: "loading",
    message: "Connecting to server…",
  });

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef(null);
  const annotatorRef = useRef(null);
  const rafRef = useRef(null); // requestAnimationFrame handle

  // ── WebSocket — only active in predict mode with camera on ─────────────────
  const wsEnabled = mode === "predict" && cameraOn && isTrained;

  const handleWsMessage = useCallback((data) => {
    if (data.error) {
      console.warn("Prediction error from server:", data.error);
      return;
    }
    if (data.probabilities) setPrediction(data.probabilities);
  }, []);

  const { sendFrame, wsStatus } = useWebSocket({
    onMessage: handleWsMessage,
    enabled: wsEnabled,
  });

  // ── Prediction frame loop — rAF drives frame capture, WS sends them ────────
  useEffect(() => {
    if (!wsEnabled || wsStatus !== "open") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastSent = 0;
    const MIN_INTERVAL = 100; // cap at ~10fps to avoid overwhelming server

    function loop(timestamp) {
      if (timestamp - lastSent >= MIN_INTERVAL) {
        const video = cameraRef.current?.getVideo();
        const cap = cameraRef.current?.getCapture();

        if (video && cap && cameraRef.current?.hasStream()) {
          cap.width = video.videoWidth || 640;
          cap.height = video.videoHeight || 480;
          cap.getContext("2d").drawImage(video, 0, 0);
          const sent = sendFrame(cap.toDataURL("image/jpeg", 0.6));
          if (sent) lastSent = timestamp;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [wsEnabled, wsStatus, sendFrame]);

  // ── Connect to server + load data ──────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const status = await api.modelStatus();
        if (status.trained) {
          setIsTrained(true);
          setTrainTag("TRAINED ✓");
          setProgress(100);
          setTrainLog(
            `Model loaded — ${status.n_samples} samples, ${status.n_classes} classes.`,
          );
        }

        const savedClasses = await api.listClasses();
        const hydrated = await Promise.all(
          savedClasses.map(async (cls) => {
            const rows = await api.listSamples(cls.id);
            const thumbs = rows.map((r) => r.thumb);
            const sampleIds = rows.map((r) => r.id);
            return { ...cls, thumbs, sampleIds };
          }),
        );

        setClasses(hydrated);
        setServerReady(true);
        setAppStatus({
          status: "ready",
          message: `Server connected. ${hydrated.length} classes loaded.`,
        });
      } catch (e) {
        setAppStatus({
          status: "error",
          message: "Cannot reach server — is python server.py running?",
        });
      }
    }
    init();
  }, []);

  // Reflect WS status in the app status bar while in predict mode
  useEffect(() => {
    if (mode !== "predict" || !cameraOn) return;
    if (wsStatus === "open") {
      setAppStatus({
        status: "ready",
        message: "WebSocket connected — live predictions running.",
      });
    } else if (wsStatus === "connecting") {
      setAppStatus({
        status: "loading",
        message: "Connecting to prediction WebSocket…",
      });
    } else {
      setAppStatus({
        status: "loading",
        message: "WebSocket disconnected — reconnecting…",
      });
    }
  }, [wsStatus, mode, cameraOn]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  async function toggleCamera() {
    if (cameraOn) {
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      setPrediction(null);
      setAppStatus({ status: "ready", message: "Camera stopped." });
    } else {
      try {
        await cameraRef.current?.startCamera();
        setCameraOn(true);
        // wsEnabled will flip true → useWebSocket connects automatically
      } catch {
        setAppStatus({
          status: "error",
          message: "Camera access denied — check browser permissions.",
        });
      }
    }
  }

  // ── Mode switch ────────────────────────────────────────────────────────────
  function switchMode(m) {
    if (m === "predict" && !isTrained) {
      alert("Train the model first.");
      return;
    }
    setMode(m);
    if (m === "annotate") {
      // Stop camera — WS disconnects automatically because wsEnabled → false
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      setPrediction(null);
      setAppStatus({ status: "ready", message: "Switched to annotate mode." });
    }
  }

  // ── Capture from image annotator ───────────────────────────────────────────
  const captureFromImage = useCallback(async () => {
    if (selectedClass === null) return;
    if (!annotatorRef.current?.hasImage()) return;

    const dataUrl = annotatorRef.current.getCropDataUrl();
    if (!dataUrl) return;

    setAppStatus({ status: "loading", message: "Embedding sample on server…" });
    try {
      const { id: sampleId } = await api.createSample({
        class_id: classes[selectedClass].id,
        thumb: dataUrl,
      });

      setClasses((prev) => {
        const next = [...prev];
        next[selectedClass] = {
          ...next[selectedClass],
          thumbs: [...next[selectedClass].thumbs, dataUrl],
          sampleIds: [...(next[selectedClass].sampleIds || []), sampleId],
        };
        return next;
      });

      annotatorRef.current.clearBox();
      setAppStatus({
        status: "ready",
        message: "Sample captured and embedded.",
      });
    } catch (e) {
      setAppStatus({
        status: "error",
        message: `Capture failed: ${e.message}`,
      });
    }
  }, [selectedClass, classes]);

  // ── Training ───────────────────────────────────────────────────────────────
  async function trainModel() {
    setIsTraining(true);
    setTrainTag("TRAINING");
    setProgress(0);
    setAppStatus({ status: "loading", message: "Training KNN on server…" });
    setTrainLog("Sending training request to server…");

    let fakeProgress = 0;
    const ticker = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 4, 90);
      setProgress(fakeProgress);
    }, 100);

    try {
      const result = await api.train();
      clearInterval(ticker);
      setProgress(100);
      setIsTrained(true);
      setTrainTag("TRAINED ✓");
      setTrainLog(
        `Done! ${result.n_samples} samples · ${result.n_classes} classes · ` +
          `train accuracy ${result.train_accuracy}%`,
      );
      setAppStatus({
        status: "ready",
        message: `Model trained — ${result.train_accuracy}% accuracy on training data.`,
      });
    } catch (e) {
      clearInterval(ticker);
      setProgress(0);
      setTrainTag("ERROR");
      setTrainLog(`Training failed: ${e.message}`);
      setAppStatus({ status: "error", message: e.message });
    } finally {
      setIsTraining(false);
    }
  }

  function resetModel() {
    setIsTrained(false);
    setTrainTag("IDLE");
    setProgress(0);
    setTrainLog("Model reset. Retrain when ready.");
    setPrediction(null);
    setAppStatus({ status: "ready", message: "Model reset." });
  }

  // ── Class management ───────────────────────────────────────────────────────
  async function addClass(cls) {
    try {
      const created = await api.createClass(cls.name, cls.color);
      setClasses((prev) => [
        ...prev,
        { ...cls, id: created.id, thumbs: [], sampleIds: [] },
      ]);
    } catch (e) {
      setAppStatus({
        status: "error",
        message: `Failed to add class: ${e.message}`,
      });
    }
  }

  async function deleteClass(i) {
    if (!confirm(`Delete class "${classes[i].name}" and all its samples?`))
      return;
    try {
      await api.deleteClass(classes[i].id);
      setClasses((prev) => prev.filter((_, idx) => idx !== i));
      setSelectedClass((prev) =>
        prev === i ? null : prev > i ? prev - 1 : prev,
      );
      setIsTrained(false);
    } catch (e) {
      setAppStatus({
        status: "error",
        message: `Failed to delete class: ${e.message}`,
      });
    }
  }

  async function deleteThumb(thumbIdx) {
    if (selectedClass === null) return;
    const sampleId = classes[selectedClass].sampleIds?.[thumbIdx];
    if (!sampleId) return;
    try {
      await api.deleteSample(sampleId);
      setClasses((prev) => {
        const next = [...prev];
        const cls = { ...next[selectedClass] };
        cls.thumbs = cls.thumbs.filter((_, i) => i !== thumbIdx);
        cls.sampleIds = cls.sampleIds.filter((_, i) => i !== thumbIdx);
        next[selectedClass] = cls;
        return next;
      });
    } catch (e) {
      setAppStatus({
        status: "error",
        message: `Failed to delete sample: ${e.message}`,
      });
    }
  }

  async function clearSamples() {
    if (selectedClass === null) return;
    try {
      await api.deleteSamplesByClass(classes[selectedClass].id);
      setClasses((prev) => {
        const next = [...prev];
        next[selectedClass] = {
          ...next[selectedClass],
          thumbs: [],
          sampleIds: [],
        };
        return next;
      });
    } catch (e) {
      setAppStatus({
        status: "error",
        message: `Failed to clear samples: ${e.message}`,
      });
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalSamples = classes.reduce((a, c) => a + (c.thumbs?.length ?? 0), 0);

  // WS indicator badge
  const wsBadge = wsEnabled
    ? wsStatus === "open"
      ? "WS ●"
      : "WS ○"
    : "PREDICT";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 pb-20">
      {/* Header */}
      <header className="border-b-2 border-ink pb-4 mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight leading-none">
            Vision<span className="text-ember italic">Lab</span>
          </h1>
          <p className="font-mono text-xs text-ink2 mt-1 tracking-wider">
            Local · PyTorch MobileNetV2 · KNN Classifier
          </p>
        </div>
        <div className="font-mono text-[10px] text-ink2 tracking-widest uppercase text-right leading-relaxed">
          FastAPI · SQLite · WebSocket
          <br />
          scikit-learn KNN
        </div>
      </header>

      <StatusBar status={appStatus.status} message={appStatus.message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* Annotate — image upload */}
          {mode === "annotate" && (
            <Panel title="Image Annotator" badge="ANNOTATE">
              <div className="flex border-b border-ink">
                {["annotate", "predict"].map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 font-mono text-[10px] tracking-[2px] uppercase py-2.5
                      transition-colors border-r border-rule last:border-r-0
                      ${mode === m ? "bg-ink text-amber" : "bg-sand text-ink2 hover:bg-rule"}`}
                  >
                    {m === "annotate" ? "◉ Annotate" : "◎ Predict"}
                  </button>
                ))}
              </div>

              <ImageAnnotator
                ref={annotatorRef}
                selectedClass={selectedClass}
                classes={classes}
              />

              <div className="flex gap-2 p-3 border-t border-ink">
                <button
                  onClick={captureFromImage}
                  disabled={!serverReady || selectedClass === null}
                  className="flex-1 font-mono text-xs tracking-wider uppercase py-2 px-4
                    bg-ember text-white border border-ember
                    hover:bg-[#a33208] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ⊕ Capture Crop
                </button>
              </div>

              <div className="px-3 pb-3">
                <p className="font-mono text-[10px] text-ink2 italic">
                  {selectedClass !== null
                    ? `Drawing into "${classes[selectedClass]?.name}" — draw a box then Capture Crop`
                    : "← Select a class first, then draw a bounding box on the image."}
                </p>
              </div>
            </Panel>
          )}

          {/* Predict — live camera + WebSocket */}
          {mode === "predict" && (
            <Panel title="Camera Feed" badge={wsBadge}>
              <div className="flex border-b border-ink">
                {["annotate", "predict"].map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 font-mono text-[10px] tracking-[2px] uppercase py-2.5
                      transition-colors border-r border-rule last:border-r-0
                      ${mode === m ? "bg-ink text-amber" : "bg-sand text-ink2 hover:bg-rule"}`}
                  >
                    {m === "annotate" ? "◉ Annotate" : "◎ Predict"}
                  </button>
                ))}
              </div>

              <CameraView ref={cameraRef} mode={mode} isTrained={isTrained} />

              <div className="flex items-center gap-3 p-3 border-t border-ink">
                <button
                  onClick={toggleCamera}
                  disabled={!serverReady}
                  className={`font-mono text-xs tracking-wider uppercase py-2 px-4
                    border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                    ${
                      cameraOn
                        ? "bg-ink text-paper border-ink hover:bg-ink2"
                        : "bg-ember text-white border-ember hover:bg-[#a33208]"
                    }`}
                >
                  {cameraOn ? "Stop Camera" : "Start Camera"}
                </button>

                {/* WebSocket status indicator */}
                {cameraOn && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        wsStatus === "open"
                          ? "bg-forest shadow-[0_0_6px_#2a6e4a]"
                          : wsStatus === "connecting"
                            ? "bg-amber animate-blink"
                            : "bg-red-400"
                      }`}
                    />
                    <span className="font-mono text-[10px] text-ink2 tracking-wide uppercase">
                      {wsStatus === "open"
                        ? "WebSocket live"
                        : wsStatus === "connecting"
                          ? "Connecting…"
                          : "Reconnecting…"}
                    </span>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Prediction results */}
          <Panel
            title="Class Probabilities"
            badge={isTrained ? "LIVE" : "IDLE"}
          >
            <PredictionView prediction={prediction} classes={classes} />
          </Panel>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">
          <Panel
            title="Classes"
            badge={`${classes.length} class${classes.length !== 1 ? "es" : ""}`}
          >
            <ClassManager
              classes={classes}
              selectedClass={selectedClass}
              onSelect={setSelectedClass}
              onAdd={addClass}
              onDelete={deleteClass}
            />
          </Panel>

          <Panel
            title="Captured Samples"
            badge={
              selectedClass !== null
                ? classes[selectedClass]?.name?.toUpperCase()
                : "SELECT CLASS"
            }
          >
            <SampleGallery
              cls={selectedClass !== null ? classes[selectedClass] : null}
              onDeleteThumb={deleteThumb}
              onClear={clearSamples}
            />
          </Panel>

          <Panel title="Training" badge={trainTag}>
            <TrainingPanel
              classes={classes}
              totalSamples={totalSamples}
              isTrained={isTrained}
              isTraining={isTraining}
              trainLog={trainLog}
              progress={progress}
              trainTag={trainTag}
              onTrain={trainModel}
              onReset={resetModel}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
