# Servo Roadmap & Pending Features

Here is the updated list of planned features to be implemented in Servo:

## ✅ 1. Docker & Docker Compose Support — IMPLEMENTED
*   **The Plan:** Add native support for Docker. This will allow Servo to detect `Dockerfile` or `docker-compose.yml` configurations and let you spin up containers as part of your project stack directly from the UI, just like regular scripts.
*   **Status:** Fully implemented. Docker and Docker Compose are now detected when scanning folders for new projects, and they are available as service language options in the UI.

## 2. Service Dependency Sequencing (Startup Order)
*   **The Plan:** Add a "Depends On" option in the configuration so that a backend (e.g., Python) waits to start until its frontend (e.g., Node.js) is fully booted up.

## ✅ 3. Git Integration (Version Control Hub) — IMPLEMENTED
*   **The Plan:** Add a Git panel inside the workspace. This will allow you to quickly check your current branch, see uncommitted changes, and switch branches for the whole project without dropping into the terminal.
*   **Status:** Fully implemented. The Git panel appears inside every Project Workspace with: branch switching, staged/unstaged file diff view, recent commit history, stash list, remote URLs, and ahead/behind sync status.

## 4. Service Reordering
*   **The Plan:** Add drag-and-drop handles or up/down arrows so you can reorder your services in the dashboard to keep the most important ones at the top.
