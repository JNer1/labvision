import { useState, useRef, useEffect, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";

import { useMobilenet } from "./useMobilenet.js";
import { createKNN } from "./knn.js";
import { api } from "./api.js";

import StatusBar from "./components/StatusBar.jsx";
import Panel from "./components/Panel.jsx";
import CameraView from "./components/CameraView.jsx";
import ImageAnnotator from "./components/ImageAnnotator.jsx";
import ClassManager from "./components/ClassManager.jsx";
import SampleGallery from "./components/SampleGallery.jsx";
import TrainingPanel from "./components/TrainingPanel.jsx";
import PredictionView from "./components/PredictionView.jsx";

export default function App() {
  const {
    status: tfStatus,
    message: tfMessage,
    embed,
    isReady,
  } = useMobilenet();

  // ── State ──────────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [mode, setMode] = useState("annotate"); // 'annotate' | 'predict'
  const [cameraOn, setCameraOn] = useState(false);
  const [dbReady, setDbReady] = useState(false);

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
    message: "",
  });

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef(null);
  const annotatorRef = useRef(null);
  const knnRef = useRef(createKNN());
  const predLoopRef = useRef(null);

  // ── Sync TF status ─────────────────────────────────────────────────────────
  useEffect(() => {
    setAppStatus({ status: tfStatus, message: tfMessage });
  }, [tfStatus, tfMessage]);

  // ── Load from DB on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadFromServer() {
      try {
        const savedClasses = await api.listClasses();
        if (savedClasses.length === 0) {
          setDbReady(true);
          return;
        }

        const hydrated = await Promise.all(
          savedClasses.map(async (cls) => {
            const rows = await api.listSamples(cls.id);
            const samples = rows.map((r) => tf.keep(tf.tensor1d(r.embedding)));
            const thumbs = rows.map((r) => r.thumb);
            const sampleIds = rows.map((r) => r.id);
            return { ...cls, samples, thumbs, sampleIds };
          }),
        );

        setClasses(hydrated);
        setTrainLog(`Restored ${hydrated.length} classes from local database.`);
        setAppStatus({
          status: "ready",
          message: `Loaded ${hydrated.length} classes from DB.`,
        });
      } catch (e) {
        console.warn(
          "Could not reach server — running without persistence.",
          e,
        );
        setAppStatus({
          status: "ready",
          message: "Server offline — changes will not be saved.",
        });
      } finally {
        setDbReady(true);
      }
    }
    loadFromServer();
  }, []);

  // ── Camera (predict mode only) ─────────────────────────────────────────────
  async function toggleCamera() {
    if (cameraOn) {
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      stopPredLoop();
      setAppStatus({ status: "ready", message: "Camera stopped." });
    } else {
      try {
        await cameraRef.current?.startCamera();
        setCameraOn(true);
        setAppStatus({ status: "ready", message: "Camera active." });
        if (isTrained) startPredLoop();
      } catch {
        setAppStatus({
          status: "error",
          message: "Camera access denied — check browser permissions.",
        });
      }
    }
  }

  // ── Capture from image annotator ───────────────────────────────────────────
  const captureFromImage = useCallback(async () => {
    if (selectedClass === null) return;
    if (!annotatorRef.current?.hasImage()) return;

    const crop = annotatorRef.current.getCrop();
    const dataUrl = annotatorRef.current.getCropDataUrl();
    if (!crop || !dataUrl) return;

    try {
      const embedding = tf.keep(embed(crop));
      const embeddingData = await embedding.data();

      const { id: sampleId } = await api.createSample({
        class_id: classes[selectedClass].id,
        thumb: dataUrl,
        embedding: Array.from(embeddingData),
      });

      setClasses((prev) => {
        const next = [...prev];
        next[selectedClass] = {
          ...next[selectedClass],
          samples: [...next[selectedClass].samples, embedding],
          thumbs: [...next[selectedClass].thumbs, dataUrl],
          sampleIds: [...(next[selectedClass].sampleIds || []), sampleId],
        };
        return next;
      });

      annotatorRef.current.clearBox();
    } catch (e) {
      console.error("Capture from image failed", e);
    }
  }, [selectedClass, isReady, embed, classes]);

  // ── Prediction loop (camera) ───────────────────────────────────────────────
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

  // Re-start pred loop when isTrained flips on in predict mode
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
      if (cameraOn) startPredLoop();
    } else {
      stopPredLoop();
      cameraRef.current?.stopCamera();
      setCameraOn(false);
      setPrediction(null);
    }
  }

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

  // ── Class management ───────────────────────────────────────────────────────
  async function addClass(cls) {
    const created = await api.createClass(cls.name, cls.color);
    setClasses((prev) => [...prev, { ...cls, id: created.id, sampleIds: [] }]);
  }

  async function deleteClass(i) {
    if (!confirm(`Delete class "${classes[i].name}" and all its samples?`))
      return;
    classes[i].samples.forEach((t) => t.dispose());
    await api.deleteClass(classes[i].id);
    setClasses((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedClass((prev) =>
      prev === i ? null : prev > i ? prev - 1 : prev,
    );
    setIsTrained(false);
    stopPredLoop();
  }

  async function deleteThumb(thumbIdx) {
    if (selectedClass === null) return;
    const sampleId = classes[selectedClass].sampleIds?.[thumbIdx];
    if (sampleId) await api.deleteSample(sampleId);
    setClasses((prev) => {
      const next = [...prev];
      const cls = { ...next[selectedClass] };
      cls.samples[thumbIdx].dispose();
      cls.samples = cls.samples.filter((_, i) => i !== thumbIdx);
      cls.thumbs = cls.thumbs.filter((_, i) => i !== thumbIdx);
      cls.sampleIds = (cls.sampleIds || []).filter((_, i) => i !== thumbIdx);
      next[selectedClass] = cls;
      return next;
    });
  }

  async function clearSamples() {
    if (selectedClass === null) return;
    await api.deleteSamplesByClass(classes[selectedClass].id);
    setClasses((prev) => {
      const next = [...prev];
      next[selectedClass].samples.forEach((t) => t.dispose());
      next[selectedClass] = {
        ...next[selectedClass],
        samples: [],
        thumbs: [],
        sampleIds: [],
      };
      return next;
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalSamples = classes.reduce((a, c) => a + c.samples.length, 0);

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
            Local · No API · Runs entirely in your browser
          </p>
        </div>
        <div className="font-mono text-[10px] text-ink2 tracking-widest uppercase text-right leading-relaxed">
          TensorFlow.js · MobileNet v2
          <br />
          KNN Transfer Learning
        </div>
      </header>

      <StatusBar status={appStatus.status} message={appStatus.message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* Annotate panel — image upload */}
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
                  disabled={!isReady || !dbReady || selectedClass === null}
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

          {/* Predict panel — live camera */}
          {mode === "predict" && (
            <Panel title="Camera Feed" badge="PREDICT">
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

              <div className="flex gap-2 p-3 border-t border-ink">
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
              </div>

              <div className="px-3 pb-3">
                <p className="font-mono text-[10px] text-ink2 italic">
                  {isTrained
                    ? "Live predictions running from camera feed."
                    : "Train the model first to enable predictions."}
                </p>
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
