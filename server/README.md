# Labvision Server

A FastAPI server that persists classes and samples to a local SQLite file (`visionlab.db`).

## Setup

```bash
# 1. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate      # Mac/Linux
venv\Scripts\activate         # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the server
python server.py
```

The server starts at http://127.0.0.1:8000  
The database file `visionlab.db` is created automatically in this folder on first run.

## API Docs

FastAPI generates interactive docs automatically — visit http://127.0.0.1:8000/docs once the server is running.
