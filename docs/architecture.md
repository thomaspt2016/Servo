# Architecture

Servo follows a hybrid architecture, combining a lightweight Python system-level backend with a rich web-based frontend using `pywebview`.

## Core Components

```text
├── app.py                 # Core Python application & OS process management
├── storage.json           # JSON database tracking project settings
├── servo.log              # Application lifecycle & process manager logs
└── gui/                   # React + Tailwind frontend workspace
```

### Python Backend (`app.py`)

- **Process Management**: Handles spinning up child processes (`subprocess.Popen`), capturing OS-level signals, and ensuring clean terminations (`taskkill` or `SIGTERM`).
- **Log Streaming**: Utilizes daemon threads that constantly read from `stdout` and `stderr` pipes of child processes without blocking the main event loop.
- **Data Persistence**: Uses a simple file-based JSON store (`storage.json`) to remember your projects and their configurations.
- **Window Management**: Uses `pywebview` to render the GUI window native to the operating system, bypassing the need for a heavy Electron container.

### React Frontend (`gui/`)

- Built on **React 18** and **Vite** for incredibly fast HMR (Hot Module Replacement) during development and optimized builds for production.
- **Tailwind CSS**: Utility-first CSS framework for rapid UI styling, enabling the signature glassmorphism and modern aesthetic.
- **shadcn/ui**: High-quality UI components built with Radix UI and Tailwind.

## The Bridge (API)

The frontend communicates with the Python backend via the `pywebview` JavaScript API. Functions exposed in Python are callable directly from JavaScript (`window.pywebview.api.*`), allowing seamless state syncs and command triggers.
