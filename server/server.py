import base64
import io
import json
import os
import pickle
import sqlite3
from contextlib import contextmanager

import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from sklearn.neighbors import KNeighborsClassifier

DB_PATH = os.path.join(os.path.dirname(__file__), "visionlab.db")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "knn_model.pkl")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MobileNet feature extractor ───────────────────────────────────────────────
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

backbone = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
backbone.classifier = torch.nn.Identity()
backbone = backbone.to(device)
backbone.eval()

preprocess = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)

# ── KNN state ─────────────────────────────────────────────────────────────────
knn: KNeighborsClassifier | None = None
knn_class_ids: list[int] = []

if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, "rb") as f:
        saved = pickle.load(f)
        knn = saved["knn"]
        knn_class_ids = saved["class_ids"]
    print(f"Loaded existing KNN model with {len(knn_class_ids)} classes.")

# ── Helpers ───────────────────────────────────────────────────────────────────


def decode_image(data_url: str) -> Image.Image:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data_url))).convert("RGB")


@torch.no_grad()
def embed_image(img: Image.Image) -> np.ndarray:
    tensor = preprocess(img).unsqueeze(0).to(device)
    return backbone(tensor).squeeze().cpu().numpy().astype(np.float32)


def run_inference(data_url: str) -> dict:
    """Embed a frame and return per-class probabilities. Raises if not trained."""
    if knn is None:
        raise RuntimeError("Model not trained.")
    img = decode_image(data_url)
    embedding = embed_image(img).reshape(1, -1)
    probs = knn.predict_proba(embedding)[0]
    return {
        "probabilities": {
            int(knn.classes_[i]): round(float(probs[i]), 4)
            for i in range(len(knn.classes_))
        }
    }


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS classes (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                name  TEXT NOT NULL,
                color TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS samples (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                thumb     TEXT NOT NULL,
                embedding TEXT NOT NULL
            )
        """)


init_db()

# ── Pydantic models ───────────────────────────────────────────────────────────


class ClassIn(BaseModel):
    name: str
    color: str


class SampleIn(BaseModel):
    class_id: int
    thumb: str


# ── REST: Classes ─────────────────────────────────────────────────────────────


@app.get("/classes")
def list_classes():
    with get_db() as db:
        rows = db.execute("SELECT * FROM classes ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.post("/classes", status_code=201)
def create_class(body: ClassIn):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO classes (name, color) VALUES (?, ?)", (body.name, body.color)
        )
    return {"id": cur.lastrowid, "name": body.name, "color": body.color}


@app.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: int):
    with get_db() as db:
        db.execute("DELETE FROM classes WHERE id = ?", (class_id,))


# ── REST: Samples ─────────────────────────────────────────────────────────────


@app.get("/classes/{class_id}/samples")
def list_samples(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, class_id, thumb FROM samples WHERE class_id = ? ORDER BY id",
            (class_id,),
        ).fetchall()
    return [
        {"id": r["id"], "class_id": r["class_id"], "thumb": r["thumb"]} for r in rows
    ]


@app.post("/samples", status_code=201)
def create_sample(body: SampleIn):
    try:
        img = decode_image(body.thumb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    embedding = embed_image(img)
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO samples (class_id, thumb, embedding) VALUES (?, ?, ?)",
            (body.class_id, body.thumb, json.dumps(embedding.tolist())),
        )
    return {"id": cur.lastrowid}


@app.delete("/samples/{sample_id}", status_code=204)
def delete_sample(sample_id: int):
    with get_db() as db:
        db.execute("DELETE FROM samples WHERE id = ?", (sample_id,))


@app.delete("/classes/{class_id}/samples", status_code=204)
def delete_samples_by_class(class_id: int):
    with get_db() as db:
        db.execute("DELETE FROM samples WHERE class_id = ?", (class_id,))


# ── REST: Train ───────────────────────────────────────────────────────────────


@app.post("/train")
def train():
    global knn, knn_class_ids

    with get_db() as db:
        classes = db.execute("SELECT * FROM classes ORDER BY id").fetchall()
        if len(classes) < 2:
            raise HTTPException(
                status_code=400, detail="Need at least 2 classes to train."
            )

        X, y = [], []
        class_counts = {}
        for cls in classes:
            rows = db.execute(
                "SELECT embedding FROM samples WHERE class_id = ?", (cls["id"],)
            ).fetchall()
            if len(rows) < 3:
                raise HTTPException(
                    status_code=400,
                    detail=f'Class "{cls["name"]}" needs at least 3 samples (has {len(rows)}).',
                )
            for row in rows:
                X.append(np.array(json.loads(row["embedding"]), dtype=np.float32))
                y.append(cls["id"])
            class_counts[cls["name"]] = len(rows)

    X = np.array(X)
    y = np.array(y)

    k = min(5, len(X))
    clf = KNeighborsClassifier(n_neighbors=k, metric="cosine", weights="distance")
    clf.fit(X, y)

    accuracy = float(np.mean(clf.predict(X) == y))

    knn = clf
    knn_class_ids = [cls["id"] for cls in classes]

    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"knn": knn, "class_ids": knn_class_ids}, f)

    return {
        "status": "trained",
        "n_samples": len(X),
        "n_classes": len(classes),
        "k": k,
        "train_accuracy": round(accuracy * 100, 1),
        "class_counts": class_counts,
    }


@app.get("/model/status")
def model_status():
    return {
        "trained": knn is not None,
        "n_classes": len(knn_class_ids) if knn else 0,
        "n_samples": int(knn.n_samples_fit_) if knn else 0,
    }


# ── WebSocket: Live prediction ────────────────────────────────────────────────


@app.websocket("/ws/predict")
async def predict_ws(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected.")
    try:
        while True:
            # Receive a base64 JPEG frame from the browser
            data = await websocket.receive_text()

            if knn is None:
                await websocket.send_json({"error": "Model not trained yet."})
                continue

            try:
                result = run_inference(data)
                await websocket.send_json(result)
            except Exception as e:
                await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        print("WebSocket client disconnected.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
