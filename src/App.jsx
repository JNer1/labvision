import { useState, useRef, useEffect, useCallback } from "react";
import * as tf from "@tensorflow/tfjs/dist/tf.es2017.js";

import { useMobilenet } from "./useMobilenet";
import { createKNN } from "./knn";

import StatusBar from "./components/StatusBar";
import Panel from "./components/Panel";
import CameraView from "./components/CameraView";
import ClassManager from "./components/ClassManager";
import SampleGallery from "./components/SampleGallery";
import TrainingPanel from "./components/TrainingPanel";
import PredictionView from "./components/PredictionView";

export default function App() {
  const {
    status: tfStatus,
    message: tfMessage,
    embed,
    isReady,
  } = useMobilenet();

  // ── App state ──────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [mode, setMode] = useState("annotate"); // 'annotate' | 'predict'
  const [cameraOn, setCameraOn] = useState(false);
  const [autoOn, setAutoOn] = useState(false);

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

  // Status bar
  const [appStatus, setAppStatus] = useState({
    status: "loading",
    message: tfMessage,
  });

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef(null);
  const knnRef = useRef(createKNN());
  const autoIntervalRef = useRef(null);
  const predLoopRef = useRef(null);

  // Sync TF status → app status bar
  useEffect(() => {
    setAppStatus({ status: tfStatus, message: tfMessage });
  }, [tfStatus, tfMessage]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  async function toggleCamera() {
    if (cameraOn) {
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      stopAuto();
      stopPredLoop();
      setAppStatus({ status: "ready", message: "Camera stopped." });
    } else {
      try {
        await cameraRef.current?.startCamera();
        setCameraOn(true);
        setAppStatus({ status: "ready", message: "Camera active." });
        if (mode === "predict" && isTrained) startPredLoop();
      } catch {
        setAppStatus({
          status: "error",
          message: "Camera access denied — check browser permissions.",
        });
      }
    }
  }

  // ── Capture ────────────────────────────────────────────────────────────────
  // const captureFrame = useCallback(() => {
  //   if (selectedClass === null) return;
  //   const video = cameraRef.current?.getVideo();
  //   const cap = cameraRef.current?.getCapture();
  //   if (!video || !cap || !isReady) return;
  //
  //   cap.width = video.videoWidth || 224;
  //   cap.height = video.videoHeight || 224;
  //   cap.getContext("2d").drawImage(video, 0, 0);
  //
  //   cameraRef.current?.triggerFlash();
  //
  //   const dataUrl = cap.toDataURL("image/jpeg", 0.7);
  //
  //   try {
  //     // Keep the tensor OUTSIDE tf.tidy so it isn't auto-disposed
  //     const embedding = tf.keep(embed(cap));
  //
  //     setClasses((prev) => {
  //       const next = [...prev];
  //       next[selectedClass] = {
  //         ...next[selectedClass],
  //         samples: [...next[selectedClass].samples, embedding],
  //         thumbs: [...next[selectedClass].thumbs, dataUrl],
  //       };
  //       return next;
  //     });
  //   } catch (e) {
  //     console.error("Embed failed", e);
  //   }
  // }, [selectedClass, isReady, embed]);

  const captureFrame = useCallback(() => {
    if (selectedClass === null) return;
    const video = cameraRef.current?.getVideo();
    const cap = cameraRef.current?.getCapture();
    if (!video || !cap || !isReady) return;

    cap.width = video.videoWidth || 224;
    cap.height = video.videoHeight || 224;
    cap.getContext("2d").drawImage(video, 0, 0);

    cameraRef.current?.triggerFlash();

    const dataUrl = cap.toDataURL("image/jpeg", 0.7);

    try {
      const embedding = embed(cap);
      console.log("embedding after embed():", embedding);
      console.log("isDisposed:", embedding.isDisposed);
      console.log("id:", embedding.id);

      const kept = tf.keep(embedding);
      console.log("kept isDisposed:", kept.isDisposed);

      setClasses((prev) => {
        const next = [...prev];
        next[selectedClass] = {
          ...next[selectedClass],
          samples: [...next[selectedClass].samples, kept],
          thumbs: [...next[selectedClass].thumbs, dataUrl],
        };
        return next;
      });
    } catch (e) {
      console.error("Embed failed at:", e.stack);
    }
  }, [selectedClass, isReady, embed]);

  // ── Auto capture ───────────────────────────────────────────────────────────
  function toggleAuto() {
    if (autoOn) {
      stopAuto();
    } else {
      setAutoOn(true);
      autoIntervalRef.current = setInterval(() => {
        if (mode === "annotate" && selectedClass !== null) captureFrame();
      }, 1500);
    }
  }

  function stopAuto() {
    setAutoOn(false);
    clearInterval(autoIntervalRef.current);
  }

  // Keep auto interval in sync when captureFrame changes
  useEffect(() => {
    if (autoOn) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = setInterval(() => {
        if (mode === "annotate" && selectedClass !== null) captureFrame();
      }, 1500);
    }
  }, [captureFrame, autoOn, mode, selectedClass]);

  // ── Training ───────────────────────────────────────────────────────────────
  async function trainModel() {
    setIsTraining(true);
    setTrainTag("TRAINING");
    setAppStatus({ status: "loading", message: "Building KNN classifier…" });

    await new Promise((r) => setTimeout(r, 50));

    knnRef.current.clear();
    const knn = knnRef.current;

    let count = 0;
    const total = classes.reduce((a, c) => a + c.samples.length, 0);

    for (let ci = 0; ci < classes.length; ci++) {
      for (const emb of classes[ci].samples) {
        knn.addExample(emb, ci);
        count++;
        setProgress(Math.round((count / total) * 100));
        setTrainLog(`Indexing sample ${count} / ${total}…`);
        if (count % 15 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }

    setIsTrained(true);
    setIsTraining(false);
    setTrainTag("TRAINED ✓");
    setProgress(100);
    setTrainLog(
      `Done! ${total} samples across ${classes.length} classes indexed.`,
    );
    setAppStatus({
      status: "ready",
      message: `Model ready — ${total} samples, ${classes.length} classes.`,
    });

    if (mode === "predict" && cameraOn) startPredLoop();
  }

  function resetModel() {
    knnRef.current.clear();
    setIsTrained(false);
    setTrainTag("IDLE");
    setProgress(0);
    setTrainLog("Model reset. Re-annotate or load a saved model.");
    setPrediction(null);
    stopPredLoop();
    setAppStatus({ status: "ready", message: "Model reset." });
  }

  // ── Prediction loop ────────────────────────────────────────────────────────
  function startPredLoop() {
    stopPredLoop();
    if (!isTrained) return;

    async function loop() {
      const video = cameraRef.current?.getVideo();
      const cap = cameraRef.current?.getCapture();
      if (!video || !cap || !cameraRef.current?.hasStream()) return;

      cap.width = video.videoWidth || 224;
      cap.height = video.videoHeight || 224;
      cap.getContext("2d").drawImage(video, 0, 0);

      try {
        const embedding = embed(cap);
        const k = Math.min(7, knnRef.current.size);
        const result = await knnRef.current.predict(embedding, k);
        embedding.dispose();
        if (result) setPrediction(result);
      } catch (e) {
        console.error("Predict error", e);
      }

      predLoopRef.current = requestAnimationFrame(loop);
    }

    predLoopRef.current = requestAnimationFrame(loop);
  }

  function stopPredLoop() {
    if (predLoopRef.current) {
      cancelAnimationFrame(predLoopRef.current);
      predLoopRef.current = null;
    }
  }

  // Re-start pred loop when isTrained flips on
  useEffect(() => {
    if (isTrained && mode === "predict" && cameraOn) startPredLoop();
    return stopPredLoop;
  }, [isTrained]);

  // ── Mode switch ────────────────────────────────────────────────────────────
  function switchMode(m) {
    if (m === "predict" && !isTrained) {
      alert("Train the model first.");
      return;
    }
    setMode(m);
    if (m === "predict") {
      stopAuto();
      if (cameraOn) startPredLoop();
    } else {
      stopPredLoop();
      setPrediction(null);
    }
  }

  // ── Class management ───────────────────────────────────────────────────────
  function addClass(cls) {
    setClasses((prev) => [...prev, cls]);
  }

  function deleteClass(i) {
    if (!confirm(`Delete class "${classes[i].name}" and all its samples?`))
      return;
    classes[i].samples.forEach((t) => t.dispose());
    setClasses((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedClass((prev) =>
      prev === i ? null : prev > i ? prev - 1 : prev,
    );
    setIsTrained(false);
    stopPredLoop();
  }

  function deleteThumb(thumbIdx) {
    if (selectedClass === null) return;
    setClasses((prev) => {
      const next = [...prev];
      const cls = { ...next[selectedClass] };
      cls.samples[thumbIdx].dispose();
      cls.samples = cls.samples.filter((_, i) => i !== thumbIdx);
      cls.thumbs = cls.thumbs.filter((_, i) => i !== thumbIdx);
      next[selectedClass] = cls;
      return next;
    });
  }

  function clearSamples() {
    if (selectedClass === null) return;
    setClasses((prev) => {
      const next = [...prev];
      next[selectedClass].samples.forEach((t) => t.dispose());
      next[selectedClass] = { ...next[selectedClass], samples: [], thumbs: [] };
      return next;
    });
  }

  // ── Save / Load ────────────────────────────────────────────────────────────
  async function saveModel() {
    const data = {
      classes: classes.map((c) => ({ name: c.name, color: c.color })),
      examples: await knnRef.current.serialize(),
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "visionlab-model.json";
    a.click();
  }

  async function loadModel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    setClasses(data.classes.map((c) => ({ ...c, samples: [], thumbs: [] })));
    knnRef.current.deserialize(data.examples);
    setIsTrained(true);
    setTrainTag("LOADED ✓");
    setProgress(100);
    setTrainLog(
      `Loaded: ${data.classes.length} classes, ${data.examples.length} indexed samples.`,
    );
    setAppStatus({ status: "ready", message: `Model loaded from file.` });
    e.target.value = "";
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalSamples = classes.reduce((a, c) => a + c.samples.length, 0);

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 pb-20">
      {/* Header */}
      <header className="border-b-2 border-ink pb-4 mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight leading-none">
            Vision<span className="text-ember italic">Lab</span>
          </h1>
          <p className="font-mono text-xs text-ink2 mt-1 tracking-wider">
            Local · No API · Runs entirely in your browser
          </p>
        </div>
        <div className="font-mono text-[10px] text-ink2 tracking-widest uppercase text-right leading-relaxed">
          TensorFlow.js · MobileNet v2
          <br />
          KNN Transfer Learning
        </div>
      </header>

      {/* Status */}
      <StatusBar status={appStatus.status} message={appStatus.message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* Camera */}
          <Panel
            title="Camera Feed"
            badge={mode === "annotate" ? "ANNOTATE" : "PREDICT"}
          >
            {/* Mode tabs */}
            <div className="flex border-b border-ink">
              {["annotate", "predict"].map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 font-mono text-[10px] tracking-[2px] uppercase py-2.5
                    transition-colors border-r border-rule last:border-r-0
                    ${
                      mode === m
                        ? "bg-ink text-amber"
                        : "bg-sand text-ink2 hover:bg-rule"
                    }`}
                >
                  {m === "annotate" ? "◉ Annotate" : "◎ Predict"}
                </button>
              ))}
            </div>

            <CameraView
              ref={cameraRef}
              mode={mode}
              isTrained={isTrained}
              selectedClass={selectedClass}
            />

            {/* Camera controls */}
            <div className="flex gap-2 p-3 border-t border-ink flex-wrap">
              <button
                onClick={toggleCamera}
                disabled={!isReady}
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

              {mode === "annotate" && (
                <>
                  <button
                    onClick={captureFrame}
                    disabled={!cameraOn || selectedClass === null}
                    className="flex-1 font-mono text-xs tracking-wider uppercase py-2 px-4
                      border border-ink hover:bg-ink hover:text-paper
                      disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ⊕ Capture Sample
                  </button>
                  <button
                    onClick={toggleAuto}
                    disabled={!cameraOn || selectedClass === null}
                    className={`font-mono text-xs tracking-wider uppercase py-2 px-3
                      border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                      ${
                        autoOn
                          ? "bg-amber text-ink border-amber"
                          : "border-rule text-ink2 hover:bg-ink hover:text-paper hover:border-ink"
                      }`}
                  >
                    Auto {autoOn ? "ON" : "OFF"}
                  </button>
                </>
              )}
            </div>

            {/* Hint bar */}
            <div className="px-3 pb-3">
              <p className="font-mono text-[10px] text-ink2 italic">
                {mode === "annotate"
                  ? selectedClass !== null
                    ? `Capturing into → "${classes[selectedClass]?.name}"`
                    : "← Select a class on the right, then capture samples."
                  : isTrained
                    ? "Live predictions running. Switch to Annotate to add more samples."
                    : "Train the model first to enable predictions."}
              </p>
            </div>
          </Panel>

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
          {/* Classes */}
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

          {/* Sample gallery */}
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

          {/* Training */}
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
              onSave={saveModel}
              onLoad={loadModel}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
