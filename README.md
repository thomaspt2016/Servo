<div align="center">

# 🚀 Servo 
### The Language-Agnostic Developer Dashboard

[![Python](https://img.shields.io/badge/Python-3.x-blue.svg?style=for-the-badge&logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-18-cyan.svg?style=for-the-badge&logo=react)](https://reactjs.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4.svg?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)
[![PyWebView](https://img.shields.io/badge/PyWebView-Desktop-brightgreen.svg?style=for-the-badge&logo=python)](https://pywebview.flowrl.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**Configure, launch, monitor, and stop multiple local projects from a single beautiful dashboard.**

---

</div>

## ✨ What is Servo?

Servo is a lightweight, high-performance desktop process manager designed to supercharge your local development workflow. Built with a **Python (`pywebview`)** backend and a stunning **React (`Tailwind CSS` + custom `shadcn` styling)** frontend, it completely eliminates terminal clutter.

Whether you're juggling microservices, full-stack monorepos, or disparate scripts, Servo allows you to manage multiple development environments (Python virtual environments, Node.js, Go, Rust, etc.) simultaneously. It spawns independent child process trees directly inside each project's directory and streams console logs in real-time to a centralized dashboard.

<br>

## 🌟 Key Features

* 💻 **Language Agnostic:** Run Python, Node.js, Rust, Go, or arbitrary shell scripts with ease.
* 🖥️ **PiP Overlay Mode:** Seamlessly monitor your running services with a discreet Picture-in-Picture window that snaps to the bottom right of your screen.
* ⚡ **Global Hotkey (Windows):** Toggle the dashboard instantly from anywhere using `Ctrl+Alt+S`.
* 🛡️ **Graceful Process Tree Termination:** Never leave zombie processes behind. Servo aggressively cleans up child process trees (`taskkill` on Windows, `SIGTERM` on Unix).
* 🧵 **Multi-threaded Log Pipe Draining:** Background daemon threads continuously pull from `stdout` and `stderr` streams, buffering logs instantly to the frontend.
* 🎨 **Stunning UI:** Built with modern glassmorphism, responsive Tailwind design, and custom React components.

<br>

## 🏗️ Project Architecture

```text
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

## 🤝 Contributing & Issues

We welcome contributions from the community! If you'd like to help improve Servo or report a bug, please check out our detailed guidelines in the [CONTRIBUTING.md](CONTRIBUTING.md) file. 

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

<br>

## 📄 License

This project is licensed under the **MIT License**. You are free to use, modify, and distribute this software in both personal and commercial projects. See the [LICENSE](LICENSE) file for more details.

<br>

<div align="center">
  <p>Built with ❤️ for developers who hate terminal clutter.</p>
</div>
