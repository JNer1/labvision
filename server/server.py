import json
import os
import sqlite3
from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(__file__), "visionlab.db")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB setup ──────────────────────────────────────────────────────────────────


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
    embedding: list[float]


# ── Classes ───────────────────────────────────────────────────────────────────


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


# ── Samples ───────────────────────────────────────────────────────────────────


@app.get("/classes/{class_id}/samples")
def list_samples(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM samples WHERE class_id = ? ORDER BY id", (class_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "class_id": r["class_id"],
            "thumb": r["thumb"],
            "embedding": json.loads(r["embedding"]),
        }
        for r in rows
    ]


@app.post("/samples", status_code=201)
def create_sample(body: SampleIn):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO samples (class_id, thumb, embedding) VALUES (?, ?, ?)",
            (body.class_id, body.thumb, json.dumps(body.embedding)),
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
