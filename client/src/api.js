const BASE = "http://localhost:8000";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `${method} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Classes
  listClasses: () => request("GET", "/classes"),
  createClass: (name, color) => request("POST", "/classes", { name, color }),
  deleteClass: (id) => request("DELETE", `/classes/${id}`),

  // Samples
  listSamples: (classId) => request("GET", `/classes/${classId}/samples`),
  createSample: (body) => request("POST", "/samples", body),
  deleteSample: (id) => request("DELETE", `/samples/${id}`),
  deleteSamplesByClass: (classId) =>
    request("DELETE", `/classes/${classId}/samples`),

  // ML
  train: () => request("POST", "/train"),
  predict: (image) => request("POST", "/predict", { image }),
  modelStatus: () => request("GET", "/model/status"),
};
