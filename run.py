#!/usr/bin/env python3
"""
Bengsin Unified Launcher - Monolithic Mode
Runs backend which serves both API and frontend on port 8000.

Usage:
    python run.py
    python run.py --port 8000
"""

import subprocess
import sys
import signal
import os
import time
from pathlib import Path

# Process handle
backend_proc = None

def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully"""
    print("\n\n🛑 Shutting down server...")
    if backend_proc:
        backend_proc.terminate()
    
    # Wait for graceful shutdown
    time.sleep(1)
    
    # Force kill if still running
    if backend_proc and backend_proc.poll() is None:
        backend_proc.kill()
    
    print("✅ Server stopped")
    sys.exit(0)

def main():
    global backend_proc
    
    # Register signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)
    
    # Get root directory
    root_dir = Path(__file__).parent.absolute()
    backend_dir = root_dir / "bengsin-backend"
    frontend_dir = root_dir / "bengsin-frontend"
    venv_python = root_dir / "venv" / "bin" / "python"
    
    # Use venv python if available, otherwise system python
    python_exe = str(venv_python) if venv_python.exists() else sys.executable
    
    # Validate directories exist
    if not backend_dir.exists():
        print(f"❌ Error: Backend directory not found: {backend_dir}")
        sys.exit(1)
    
    if not frontend_dir.exists():
        print(f"⚠️  Warning: Frontend directory not found: {frontend_dir}")
        print("   Backend will still run but frontend won't be served")
    
    # Parse command line arguments
    port = 8000
    
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])
    
    print("=" * 60)
    print("🚀 Bengsin - Starting Monolithic Server")
    print("=" * 60)
    print()
    
    # Start Backend (serves both API + Frontend)
    print(f"📡 Starting Backend + Frontend on http://localhost:{port}")
    print(f"   Backend dir: {backend_dir}")
    print(f"   Frontend dir: {frontend_dir}")
    print()
    
    backend_cmd = [
        python_exe, "-m", "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--reload"
    ]
    
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(backend_dir)
    )
    
    print()
    print("=" * 60)
    print("✅ Server started successfully!")
    print("=" * 60)
    print()
    print("📊 Access URLs:")
    print(f"   🔹 Application:  http://localhost:{port}")
    print(f"   🔹 API Docs:     http://localhost:{port}/docs")
    print(f"   🔹 Health:       http://localhost:{port}/health")
    print()
    print("💡 Press Ctrl+C to stop the server")
    print("=" * 60)
    print()
    
    # Wait for backend
    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()
