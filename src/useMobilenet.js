import { useState, useEffect, useRef } from "react";
import * as tf from "@tensorflow/tfjs/dist/tf.es2017.js";
import * as mobilenetModule from "@tensorflow-models/mobilenet";

/**
 * Loads TF.js + MobileNet once; exposes an `embed` function that
 * returns a 1280-D Tensor1D from an image/video/canvas element.
 */
export function useMobilenet() {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [message, setMessage] = useState("");
  const modelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setStatus("loading");
        setMessage("Initialising TensorFlow.js…");
        await tf.ready();
        if (cancelled) return;

        setMessage(
          "Downloading MobileNet weights (~20 MB, cached after first load)…",
        );
        const model = await mobilenetModule.load({ version: 2, alpha: 1.0 });
        if (cancelled) return;

        modelRef.current = model;
        setStatus("ready");
        setMessage("MobileNet ready.");
      } catch (e) {
        setStatus("error");
        setMessage("Failed to load MobileNet: " + e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Extract a 1280-D embedding from any image-like source.
   * The caller is responsible for disposing the returned tensor.
   */
  function embed(source) {
    if (!modelRef.current) throw new Error("Model not loaded");
    // Do NOT use tf.tidy here — it disposes the returned tensor.
    // Caller is responsible for disposing via tf.keep().
    const img = tf.browser
      .fromPixels(source)
      .resizeBilinear([224, 224])
      .toFloat()
      .div(127.5)
      .sub(1)
      .expandDims(0);
    const embedding = modelRef.current.infer(img, true).squeeze();
    img.dispose();
    return embedding;
  }
  return { status, message, embed, isReady: status === "ready" };
}
