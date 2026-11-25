#!/usr/bin/env python3
"""
Run Bengsin locally: the FastAPI app also serves the frontend from ./public.

    python run.py
    python run.py --port 8000
"""

import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "api"


def pick_python() -> str:
    for candidate in (ROOT / ".venv" / "bin" / "python", ROOT / "venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def main() -> None:
    if not BACKEND.is_dir():
        sys.exit(f"api/ tidak ada di {BACKEND}")

    port = 8000
    if "--port" in sys.argv:
        index = sys.argv.index("--port")
        if index + 1 < len(sys.argv):
            port = int(sys.argv[index + 1])

    print(f"Bengsin di http://localhost:{port}  (API docs: /docs)")
    try:
        subprocess.run(
            [pick_python(), "-m", "uvicorn", "app.main:app",
             "--host", "0.0.0.0", "--port", str(port), "--reload"],
            cwd=str(BACKEND),
        )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
