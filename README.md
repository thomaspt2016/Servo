<div align="center">

# 🚀 Servo 
### The Language-Agnostic Developer Dashboard

[![Python](https://img.shields.io/badge/Python-3.x-blue.svg?style=for-the-badge&logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-18-cyan.svg?style=for-the-badge&logo=react)](https://reactjs.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4.svg?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)
[![PyWebView](https://img.shields.io/badge/PyWebView-Desktop-brightgreen.svg?style=for-the-badge&logo=python)](https://pywebview.flowrl.com)

**Configure, launch, monitor, and stop multiple local projects from a single beautiful window.**

---

</div>

## ✨ What is Servo?

Servo is a lightweight, high-performance desktop process manager built with **Python (`pywebview`)** on the backend and a stunning **React (`Tailwind CSS` + custom `shadcn` styling)** frontend. 

It completely eliminates terminal clutter by allowing you to manage multiple development environments (Python virtual environments, Node.js, Go, Rust, etc.) simultaneously. It spawns independent child process trees directly inside each project's directory and streams console logs in real-time.

<br>

## 🌟 Key Features

* 💻 **Language Agnostic:** Run Python, Node.js, Rust, Go, or arbitrary shell scripts.
* 🖥️ **PiP Overlay Mode:** Seamlessly monitor your running services with a discreet Picture-in-Picture window that snaps to your bottom right screen.
* ⚡ **Global Hotkey (Windows):** Toggle the dashboard instantly from anywhere using `Ctrl+Alt+S`.
* 🛡️ **Graceful Process Tree Termination:** Never leave zombie processes behind. Servo aggressively cleans up child process trees (`taskkill` on Windows, `SIGTERM` on Unix).
* 🧵 **Multi-threaded Log Pipe Draining:** Background daemon threads continuously pull from `stdout` and `stderr` streams, buffering logs instantly to the frontend.
* 🎨 **Stunning UI:** Built with modern glassmorphism, responsive Tailwind design, and custom React components.

<br>

## 🏗️ Project Architecture

```bash
├── app.py                 # Core Python application & OS process management
├── storage.json           # JSON database tracking project settings
├── servo.log              # Application lifecycle & process manager logs
└── gui/                   # React + Tailwind frontend workspace
    ├── src/
    │   ├── App.tsx        # Dashboard layout & state handling
    │   ├── main.tsx       # Vite entrypoint
    │   ├── index.css      # Core styles & glassmorphism utilities
    │   └── components/ui/ # Custom-designed React components
    ├── vite.config.ts     # Configured for relative file compilation
    ├── tsconfig.json      # TypeScript setup
    └── package.json       # Frontend dependencies
```

<br>

## 🚀 Getting Started

### Prerequisites
Make sure you have **Node.js** (v18+) and **Python 3.x** installed on your system.

### 1. Install Dependencies
A Python virtual environment `servo` is pre-configured. Simply install the required packages:
```bash
.\servo\Scripts\pip.exe install -r requirements.txt
```

### 2. Run the App (Production Mode)
By default, `app.py` is configured with `DEBUG = False` and will load the compiled production build from `gui/dist/index.html`.
```bash
.\servo\Scripts\python.exe app.py
```

<br>

## 🛠️ Development Mode

If you wish to make changes to the frontend workspace with instant hot-reloading:

1. **Enable Debugging:** Open `app.py` and set `DEBUG = True` (around line 9).
2. **Start the Vite Server:**
   ```bash
   cd gui
   npm install
   npm run dev
   ```
3. **Launch the Python backend:** In a separate terminal, run:
   ```bash
   .\servo\Scripts\python.exe app.py
   ```

### Building for Production
To re-compile the React code into static assets for the Python wrapper:
```bash
cd gui
npm run build
```

<br>

<div align="center">
  <p>Built with ❤️ for developers who hate terminal clutter.</p>
</div>
