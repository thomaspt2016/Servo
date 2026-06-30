# Managing Projects & Services

Servo acts as the central hub for all your local development environments. Adding and configuring services correctly is crucial for a smooth workflow. Because Servo is language-agnostic, there are several nuances to understand depending on the type of service you are adding.

## Adding a New Service

To add a new service to your Servo dashboard, click the **Add Project** button in the main interface. You will be prompted for three key parameters:

### 1. Project Name
A descriptive, recognizable name. This is purely visual. (e.g., `Frontend (Vite)`, `Backend (Django)`, `Redis Cache`).

### 2. Working Directory
The absolute path to the folder where the command should be executed. 
**Nuance:** Servo will spawn the process from this location. This means any relative file paths in your code, or `.env` files your framework tries to load, will be resolved relative to this exact directory. Always ensure this points to the root of that specific service, not a parent monorepo folder (unless you are running a workspace-level command).

### 3. Command
The exact terminal command used to launch the service. This is where most of the complexity lies. Servo runs commands directly against the operating system's shell, which introduces some specific rules:

#### Nuance A: Python Virtual Environments
You **do not** need to "activate" a virtual environment before running a Python script in Servo. Activating a venv in a terminal just temporarily modifies your `PATH`. Instead, simply provide the absolute path to the Python executable inside the virtual environment:
* **Correct (Windows):** `.\venv\Scripts\python.exe main.py`
* **Correct (Unix):** `./venv/bin/python main.py`
* **Incorrect:** `activate && python main.py`

#### Nuance B: Node.js & NPM on Windows
On Windows, `npm` is technically a `.cmd` batch file. Depending on how your system is configured, simply typing `npm run dev` might cause Servo's subprocess to fail. If you encounter issues starting Node scripts, specify the explicit shell command or the `.cmd` extension:
* **Robust (Windows):** `npm.cmd run dev` or `cmd.exe /c npm run dev`
* **Mac/Linux:** `npm run dev` works out of the box.

#### Nuance C: Environment Variables
Servo executes commands exactly as written. If your service requires specific environment variables that aren't defined in a `.env` file, you must pass them in the command. 
On Windows, setting inline environment variables (like `PORT=8080 node app.js`) natively fails. You should use a package like `cross-env` in your `package.json`, or define them in a `.env` file that your application loads.

#### Nuance D: Port Conflicts
Servo does not currently manage port allocations by default. If you start a React app that binds to port `3000`, and then start a separate Express server also defaulting to `3000`, the second service will crash. Ensure the commands or configuration files for your services are explicitly set to use unique ports, **or use the dynamic `{port}` proxy feature below.**

#### Nuance E: Dynamic Ports & Caddy Reverse Proxy (CORS Fix)
When building modern fullstack apps, dealing with Cross-Origin Resource Sharing (CORS) between your local frontend dev server (e.g., Vite on port 5173) and your backend API (e.g., FastAPI on port 8000) is often a headache. 

Servo includes an embedded **Caddy reverse proxy** to automatically bridge your services. If a project defines both a frontend and backend service, you can instruct Servo to assign them dynamic ports and proxy them together on a single unified port, completely eliminating CORS.

**How to configure it:**
In the Command Configuration for your services, replace your hardcoded ports with the special `{port}` syntax. Servo will inject dynamically allocated, free ports at runtime.

* **Web Apps (Browser):** Use `{port}` to let Servo assign dynamic ports and automatically bridge your services via Caddy. 
  * *Frontend Example:* `npm run dev -- --port {port}`
  * *Backend Example (FastAPI):* `uvicorn main:app --port {port}`
  * *Backend Example (Flask):* `flask run -p {port}`
* **Desktop Apps (PyWebView/Electron):** Do **not** use `{port}`. Hardcode a static port (e.g., `--port 5173`) in both your UI and Backend commands so your desktop window knows exactly where to load the UI on boot.
* **Background Tasks (Celery/Redis):** No proxy is needed, simply do not use `{port}`.

When Servo detects services utilizing `{port}`, it will transparently download (on first run) and spin up a Caddy reverse proxy process. You will see a `[SYSTEM] Proxy started on port X` message in your logs. You can then access your frontend at `http://localhost:<proxy_port>`, and any requests made to `/api/*` will automatically be routed to your backend service!

**Code-Level Adjustments for Proxy Mode:**
Because Caddy is bridging your frontend and backend on a single port, you must adjust how your frontend code makes API requests. You no longer need to hardcode the backend port (e.g., `http://localhost:8000/api/users`). 

Instead, make **relative API calls**:
```javascript
// ❌ WRONG (Hardcoded CORS issue)
fetch("http://localhost:8000/api/users")

// ✅ CORRECT (Proxy handles it)
fetch("/api/users")
```

**Running Outside of Servo (Standalone Compatibility)**
If you change your code to use relative paths (`/api/users`), it will work beautifully inside Servo thanks to Caddy. However, if you or a teammate try to run the project *outside* of Servo manually in a terminal, those relative API calls will fail because Caddy isn't there to route them.

To overcome this issue and ensure your code works in **both** environments, you should configure your frontend dev server to act as a fallback proxy.

For example, in a **Vite** project, configure `vite.config.js`:
```javascript
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // Fallback for standalone terminal usage.
      // When running inside Servo, Caddy intercepts this before Vite even sees it!
      '/api': 'http://localhost:8000' 
    }
  }
})
```

By doing this:
1. **Inside Servo**: Caddy intercepts `/api/*` on the unified proxy port and routes it to the dynamic backend port. Vite's proxy is bypassed completely.
2. **Outside Servo**: You run Vite on `localhost:5173` and your backend on `localhost:8000`. When your code fetches `/api/users`, Vite's proxy kicks in and forwards it to `8000`.

Finally, ensure your package scripts can accept Servo's dynamic port injection:
```json
// In package.json
"scripts": {
  "dev": "vite"
}
```
*Servo Command:* `npm run dev -- --port {port}`

---

## Configuration Storage
All your project configurations are saved securely on your local machine in a `storage.json` file located in the root of the Servo installation. This file is read automatically upon startup, so your dashboard persists across sessions.

---

## Controlling the Process Lifecycle

Servo doesn't just run commands; it manages their entire lifecycle aggressively to prevent orphaned processes.

### Starting a Service
Click the **Start** button (play icon) on a project's card.
- Servo uses Python's `subprocess` module to spawn the command.
- Background daemon threads are immediately attached to the process's standard output (`stdout`) and standard error (`stderr`) pipes to begin log streaming.
- The UI will update to indicate the project is **Running**.

### Stopping a Service
Click the **Stop** button (stop square icon) to terminate a running project.
- **Graceful Termination**: Servo understands that commands like `npm run dev` often spawn multiple child processes (like `node`, `esbuild`, etc.). 
- To ensure no "zombie" processes are left behind draining your CPU, Servo performs a recursive process tree termination using `taskkill /F /T /PID <id>` on Windows (and equivalent `SIGTERM` trees on Unix).

---

## Editing and Deleting

- **Editing**: Click the **Gear** icon on a project card to modify its name, command, or working directory. You must stop the project before you can edit its core execution parameters.
- **Deleting**: If you no longer need a project in your dashboard, you can remove it via the edit menu. This only removes the configuration from `storage.json`; your actual project code remains entirely untouched on your hard drive.
