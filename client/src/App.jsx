import { useState, useRef, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket.js";
import {
  useModelStatus,
  useClasses,
  useSamples,
  useAddClass,
  useDeleteClass,
  useAddSample,
  useDeleteSample,
  useClearSamples,
  useTrain,
} from "./hooks/useQueries.js";

import StatusBar from "./components/StatusBar.jsx";
import Panel from "./components/Panel.jsx";
import CameraView from "./components/CameraView.jsx";
import ImageAnnotator from "./components/ImageAnnotator.jsx";
import ClassManager from "./components/ClassManager.jsx";
import SampleGallery from "./components/SampleGallery.jsx";
import TrainingPanel from "./components/TrainingPanel.jsx";
import PredictionView from "./components/PredictionView.jsx";

export default function App() {
  // ── Local UI state (not server state) ─────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState(null);
  const [mode, setMode] = useState("annotate");
  const [cameraOn, setCameraOn] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [isTrained, setIsTrained] = useState(false);
  const [trainLog, setTrainLog] = useState(
    "Add at least 2 classes with 3+ samples each.",
  );
  const [progress, setProgress] = useState(0);
  const [trainTag, setTrainTag] = useState("IDLE");

  const cameraRef = useRef(null);
  const annotatorRef = useRef(null);
  const rafRef = useRef(null);

  // ── Server state via Tanstack Query ───────────────────────────────────────
  const modelStatus = useModelStatus();
  const classesQuery = useClasses();

  const classes = classesQuery.data ?? [];
  const serverReady = !classesQuery.isLoading && !classesQuery.isError;

  // Load samples for selected class
  const selectedClassId =
    selectedClass != null ? classes[selectedClass]?.id : null;
  const samplesQuery = useSamples(selectedClassId);
  const currentSamples = samplesQuery.data ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addClassMut = useAddClass();
  const deleteClassMut = useDeleteClass();
  const addSampleMut = useAddSample();
  const deleteSampleMut = useDeleteSample();
  const clearSamplesMut = useClearSamples();
  const trainMut = useTrain();

  // ── Sync model status on load ──────────────────────────────────────────────
  useEffect(() => {
    if (modelStatus.data?.trained) {
      setIsTrained(true);
      setTrainTag("TRAINED ✓");
      setProgress(100);
      setTrainLog(
        `Model loaded — ${modelStatus.data.n_samples} samples, ` +
          `${modelStatus.data.n_classes} classes.`,
      );
    }
  }, [modelStatus.data]);

  // ── Status bar message ─────────────────────────────────────────────────────
  function getAppStatus() {
    if (modelStatus.isLoading || classesQuery.isLoading)
      return { status: "loading", message: "Connecting to server…" };
    if (classesQuery.isError)
      return {
        status: "error",
        message: "Cannot reach server — is python server.py running?",
      };
    if (addSampleMut.isPending)
      return { status: "loading", message: "Embedding sample on server…" };
    if (trainMut.isPending)
      return { status: "loading", message: "Training KNN on server…" };
    if (trainMut.isError)
      return {
        status: "error",
        message: trainMut.error?.message ?? "Training failed.",
      };
    if (addSampleMut.isError)
      return {
        status: "error",
        message: addSampleMut.error?.message ?? "Capture failed.",
      };
    if (mode === "predict" && cameraOn) {
      if (wsStatus === "open")
        return {
          status: "ready",
          message: "WebSocket connected — live predictions running.",
        };
      if (wsStatus === "connecting")
        return {
          status: "loading",
          message: "Connecting to prediction WebSocket…",
        };
      return {
        status: "loading",
        message: "WebSocket disconnected — reconnecting…",
      };
    }
    return {
      status: "ready",
      message: `Server connected. ${classes.length} classes loaded.`,
    };
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const wsEnabled = mode === "predict" && cameraOn && isTrained;

  const handleWsMessage = useCallback((data) => {
    if (data.probabilities) setPrediction(data.probabilities);
  }, []);

  const { sendFrame, wsStatus } = useWebSocket({
    onMessage: handleWsMessage,
    enabled: wsEnabled,
  });

  // rAF frame capture loop
  useEffect(() => {
    if (!wsEnabled || wsStatus !== "open") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastSent = 0;
    const MIN_INTERVAL = 100;

    function loop(timestamp) {
      if (timestamp - lastSent >= MIN_INTERVAL) {
        const video = cameraRef.current?.getVideo();
        const cap = cameraRef.current?.getCapture();
        if (video && cap && cameraRef.current?.hasStream()) {
          cap.width = video.videoWidth || 640;
          cap.height = video.videoHeight || 480;
          cap.getContext("2d").drawImage(video, 0, 0);
          if (sendFrame(cap.toDataURL("image/jpeg", 0.6))) lastSent = timestamp;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [wsEnabled, wsStatus, sendFrame]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  async function toggleCamera() {
    if (cameraOn) {
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      setPrediction(null);
    } else {
      try {
        await cameraRef.current?.startCamera();
        setCameraOn(true);
      } catch {
        // error reflected via getAppStatus
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
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      setPrediction(null);
    }
  }

  // ── Capture crop ───────────────────────────────────────────────────────────
  const captureFromImage = useCallback(async () => {
    if (selectedClass === null || !annotatorRef.current?.hasImage()) return;
    const dataUrl = annotatorRef.current.getCropDataUrl();
    if (!dataUrl) return;

    await addSampleMut.mutateAsync({
      classId: classes[selectedClass].id,
      thumb: dataUrl,
    });
    annotatorRef.current.clearBox();
  }, [selectedClass, classes, addSampleMut]);

  // ── Training ───────────────────────────────────────────────────────────────
  async function trainModel() {
    setTrainTag("TRAINING");
    setProgress(0);
    setTrainLog("Sending training request to server…");

    let fakeProgress = 0;
    const ticker = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 4, 90);
      setProgress(fakeProgress);
    }, 100);

    try {
      const result = await trainMut.mutateAsync();
      setIsTrained(true);
      setTrainTag("TRAINED ✓");
      setProgress(100);
      setTrainLog(
        `Done! ${result.n_samples} samples · ${result.n_classes} classes · ` +
          `train accuracy ${result.train_accuracy}%`,
      );
    } catch {
      setTrainTag("ERROR");
      setProgress(0);
      setTrainLog(`Training failed: ${trainMut.error?.message}`);
    } finally {
      clearInterval(ticker);
    }
  }

  function resetModel() {
    setIsTrained(false);
    setTrainTag("IDLE");
    setProgress(0);
    setTrainLog("Model reset. Retrain when ready.");
    setPrediction(null);
  }

  // ── Class management ───────────────────────────────────────────────────────
  async function addClass(cls) {
    await addClassMut.mutateAsync({ name: cls.name, color: cls.color });
  }

  async function deleteClass(i) {
    if (!confirm(`Delete class "${classes[i].name}" and all its samples?`))
      return;
    await deleteClassMut.mutateAsync(classes[i].id);
    setSelectedClass((prev) =>
      prev === i ? null : prev > i ? prev - 1 : prev,
    );
    if (isTrained) {
      setIsTrained(false);
      setTrainTag("IDLE");
    }
  }

  async function deleteThumb(thumbIdx) {
    const sample = currentSamples[thumbIdx];
    if (!sample) return;
    await deleteSampleMut.mutateAsync({
      sampleId: sample.id,
      classId: selectedClassId,
    });
  }

  async function clearSamples() {
    if (selectedClassId == null) return;
    await clearSamplesMut.mutateAsync(selectedClassId);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  // Build the cls object SampleGallery expects from the query data
  const selectedCls =
    selectedClass != null
      ? {
          ...classes[selectedClass],
          thumbs: currentSamples.map((s) => s.thumb),
          sampleIds: currentSamples.map((s) => s.id),
        }
      : null;

  const totalSamples =
    classes.reduce((a, c) => {
      // Use per-class sample counts from the classes list if available
      return a + (c.sample_count ?? 0);
    }, 0) || currentSamples.length; // fallback to selected class count

  const appStatus = getAppStatus();
  const wsBadge = wsEnabled
    ? wsStatus === "open"
      ? "WS ●"
      : "WS ○"
    : "PREDICT";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 pb-20">
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
          Tanstack Query · scikit-learn
        </div>
      </header>

      <StatusBar status={appStatus.status} message={appStatus.message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5">
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
                  disabled={
                    !serverReady ||
                    selectedClass === null ||
                    addSampleMut.isPending
                  }
                  className="flex-1 font-mono text-xs tracking-wider uppercase py-2 px-4
                    bg-ember text-white border border-ember
                    hover:bg-[#a33208] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {addSampleMut.isPending ? "⟳ Embedding…" : "⊕ Capture Crop"}
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

          <Panel
            title="Class Probabilities"
            badge={isTrained ? "LIVE" : "IDLE"}
          >
            <PredictionView prediction={prediction} classes={classes} />
          </Panel>
        </div>

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
              cls={selectedCls}
              onDeleteThumb={deleteThumb}
              onClear={clearSamples}
            />
          </Panel>

          <Panel title="Training" badge={trainTag}>
            <TrainingPanel
              classes={classes}
              totalSamples={totalSamples}
              isTrained={isTrained}
              isTraining={trainMut.isPending}
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
