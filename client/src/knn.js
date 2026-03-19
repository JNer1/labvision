import * as tf from "@tensorflow/tfjs";

/**
 * Simple cosine-similarity KNN classifier that operates on TF tensors.
 * Keeps examples in memory; no training loop required.
 */
export function createKNN() {
  const examples = []; // { embedding: Tensor1D (kept), label: number }

  return {
    addExample(embedding, label) {
      examples.push({ embedding: tf.keep(embedding.clone()), label });
    },

    async predict(embedding, k = 7) {
      if (examples.length === 0) return null;

      const sims = examples.map((ex) => {
        const sim = tf.tidy(
          () =>
            tf.losses
              .cosineDistance(embedding, ex.embedding, 0)
              .neg()
              .dataSync()[0],
        );
        return { label: ex.label, sim };
      });

      sims.sort((a, b) => b.sim - a.sim);
      const topK = sims.slice(0, Math.min(k, sims.length));

      // Weighted vote per class
      const scores = {};
      topK.forEach(({ label, sim }) => {
        scores[label] = (scores[label] || 0) + (sim + 1);
      });

      const total = Object.values(scores).reduce((a, b) => a + b, 0);
      const probs = {};
      for (const key in scores) {
        probs[key] = total > 0 ? scores[key] / total : 0;
      }

      const [bestLabel] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
      return { label: parseInt(bestLabel), probs };
    },

    get size() {
      return examples.length;
    },

    clear() {
      examples.forEach((e) => e.embedding.dispose());
      examples.length = 0;
    },

    /** Serialize to plain JS for JSON export */
    async serialize() {
      const data = [];
      for (const ex of examples) {
        const arr = await ex.embedding.data();
        data.push({ label: ex.label, embedding: Array.from(arr) });
      }
      return data;
    },

    /** Restore from serialized data */
    deserialize(data) {
      this.clear();
      for (const ex of data) {
        const t = tf.tensor1d(ex.embedding);
        this.addExample(t, ex.label);
        t.dispose();
      }
    },
  };
}
