import os
import json
import threading
import subprocess
import webview

from backend.logger import logger
from backend.process_manager import ProcessManager

# We duplicate DEBUG here so it can be set. If needed, you can import it or set it in app.py
DEBUG = False

class Api:
    def __init__(self):
        self.storage_lock = threading.Lock()
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.storage_path = os.path.join(self.base_dir, 'storage.json')
        self.__window = None
        self._pip_window = None
        self._pip_paused = False
        
        self._process_manager = ProcessManager(self._load_from_json, self)
        logger.info("Initialized Python IPC Api handler.")
        
    @property
    def _window(self):
        return self.__window
        
    @_window.setter
    def _window(self, value):
        self.__window = value
        self._process_manager.window = value

    def _load_from_json(self):
        if not os.path.exists(self.storage_path):
            logger.info("Project configuration database file not found. Initializing empty.")
            return []
        try:
            with open(self.storage_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Perform schema migration for older single-server projects to multi-service schema
            migrated = False
            for p in data:
                if 'services' not in p:
                    service_id = f"srv-{p.get('id', 'default')}"
                    p['services'] = [{
                        'id': service_id,
                        'name': 'Main Server',
                        'path': p.get('path', ''),
                        'command': p.get('command', ''),
                        'venv_path': p.get('venv_path', ''),
                        'use_venv': p.get('use_venv', True)
                    }]
                    # Remove deprecated fields
                    p.pop('path', None)
                    p.pop('command', None)
                    p.pop('venv_path', None)
                    p.pop('use_venv', None)
                    migrated = True
                    
            if migrated:
                logger.info("Migrated older project configurations to multi-service schema.")
                self._write_to_json(data)
                
            logger.debug(f"Successfully loaded {len(data)} projects from {self.storage_path}")
            return data
        except Exception as e:
            logger.error(f"Failed to read project database JSON: {e}", exc_info=True)
            return []

    def _write_to_json(self, data):
        try:
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
                logger.info(f"Successfully updated database configuration with {len(data)} items.")
        except Exception as e:
            logger.error(f"Failed to write projects to storage JSON: {e}", exc_info=True)

    def write_to_service(self, project_id, service_id, data):
        return self._process_manager.write_to_service(project_id, service_id, data)

    def load_projects(self):
        return self._load_from_json()

    def save_project(self, project_json):
        if isinstance(project_json, str):
            project = json.loads(project_json)
        else:
            project = project_json
            
        project_id = project.get('id')
        project_name = project.get('name')
        
        with self.storage_lock:
            projects = self._load_from_json()
            exists = False
            for i, p in enumerate(projects):
                if p.get('id') == project_id:
                    projects[i] = project
                    exists = True
                    break
            if not exists:
                projects.append(project)
            self._write_to_json(projects)
            logger.info(f"Saved project: '{project_name}' (ID: {project_id}, Category: {project.get('category')})")
            return True

    def delete_project(self, project_id):
        logger.info(f"Request to delete project ID: {project_id}")
        self.stop_project(project_id)
        with self.storage_lock:
            projects = self._load_from_json()
            projects = [p for p in projects if p.get('id') != project_id]
            self._write_to_json(projects)
            
        self._process_manager.cleanup_logs_for_project(project_id)
        logger.info(f"Deleted project config for ID: {project_id}")
        return True

    def start_service(self, project_id, service_id):
        return self._process_manager.start_service(project_id, service_id)

    def start_raw_terminal(self, terminal_id, cwd=None):
        return self._process_manager.start_raw_terminal(terminal_id, cwd)

    def stop_service(self, project_id, service_id):
        return self._process_manager.stop_service(project_id, service_id)

    def start_project(self, project_id):
        logger.info(f"Request to start all services for project ID: {project_id}")
        projects = self._load_from_json()
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return False
        success = True
        for s in project.get('services', []):
            if not self.start_service(project_id, s.get('id')):
                success = False
        return success

    def stop_project(self, project_id):
        logger.info(f"Request to stop all services for project ID: {project_id}")
        projects = self._load_from_json()
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return False
        for s in project.get('services', []):
            self.stop_service(project_id, s.get('id'))
        return True

    def get_statuses(self):
        return self._process_manager.get_statuses()

    def get_metrics(self):
        return self._process_manager.get_metrics()

    def get_logs(self, project_id, service_id):
        return self._process_manager.get_logs(project_id, service_id)

    def clear_logs(self, project_id, service_id):
        return self._process_manager.clear_logs(project_id, service_id)

    def pick_folder(self, default_dir=None):
        if self._window:
            logger.info(f"Opening native OS directory pick selector (start dir: {default_dir})...")
            try:
                directory = default_dir if default_dir and os.path.exists(default_dir) else ''
                result = self._window.create_file_dialog(webview.FileDialog.FOLDER, directory=directory)
                if result and len(result) > 0:
                    chosen = result[0].replace('\\', '/')
                    logger.info(f"User selected directory: '{chosen}'")
                    return chosen
                logger.info("Directory selector canceled by user.")
            except Exception as e:
                logger.error(f"Exception opening file selector: {e}", exc_info=True)
        return None

    def pick_file(self, default_dir=None):
        if self._window:
            logger.info(f"Opening native OS file pick selector (start dir: {default_dir})...")
            try:
                directory = default_dir if default_dir and os.name == 'nt' and os.path.exists(default_dir) else default_dir
                result = self._window.create_file_dialog(webview.FileDialog.OPEN, directory=directory or '')
                if result and len(result) > 0:
                    chosen = result[0].replace('\\', '/')
                    logger.info(f"User selected file: '{chosen}'")
                    return chosen
                logger.info("File selector canceled by user.")
            except Exception as e:
                logger.error(f"Exception opening file selector: {e}", exc_info=True)
        return None

    def open_native_terminal(self, cwd=None):
        logger.info(f"Opening native OS terminal (cwd: {cwd})...")
        try:
            directory = cwd if cwd and os.path.exists(cwd) else self.base_dir
            if os.name == 'nt':
                # Launch PowerShell natively
                subprocess.Popen(['start', 'powershell', '-NoExit'], shell=True, cwd=directory)
            else:
                # macOS / Linux fallbacks if needed
                subprocess.Popen(['x-terminal-emulator'], cwd=directory)
            return True
        except Exception as e:
            logger.error(f"Exception opening native terminal: {e}", exc_info=True)
            return False

    def get_npm_scripts(self, folder_path):
        if not folder_path:
            return []
        try:
            package_path = os.path.join(folder_path, 'package.json')
            if os.path.exists(package_path):
                with open(package_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                scripts = data.get('scripts', {})
                logger.info(f"Loaded npm scripts from {package_path}: {list(scripts.keys())}")
                return list(scripts.keys())
        except Exception as e:
            logger.error(f"Error loading npm scripts from folder {folder_path}: {e}")
        return []

    def scan_folder_for_services(self, folder_path):
        """
        Scans a folder up to 2 levels deep and detects services based on language-agnostic rules.
        """
        if not folder_path or not os.path.exists(folder_path):
            return []
            
        import time
        discovered_services = []
        
        # Rules for language-agnostic detection
        rules = [
            {
                "language": "Node.js",
                "indicators": ["package.json"],
                "command": "npm run dev",
                "use_venv": False,
                "venv_folders": []
            },
            {
                "language": "Python",
                "indicators": ["requirements.txt", "Pipfile", "pyproject.toml", "manage.py", "app.py", "main.py"],
                "command": "python app.py",
                "use_venv": True,
                "venv_folders": ["venv", "env", ".venv", ".env"]
            },
            {
                "language": "Rust",
                "indicators": ["Cargo.toml"],
                "command": "cargo run",
                "use_venv": False,
                "venv_folders": []
            },
            {
                "language": "Go",
                "indicators": ["go.mod"],
                "command": "go run .",
                "use_venv": False,
                "venv_folders": []
            },
            {
                "language": "Java",
                "indicators": ["pom.xml", "build.gradle"],
                "command": "mvn spring-boot:run",
                "use_venv": False,
                "venv_folders": []
            }
        ]
        
        ignore_dirs = {"node_modules", ".git", "__pycache__", "build", "dist", "target", "vendor", ".idea", ".vscode"}
        
        # We only want to go 2 levels deep to prevent clutter
        start_level = folder_path.rstrip(os.path.sep).count(os.path.sep)
        
        for root, dirs, files in os.walk(folder_path):
            current_level = root.rstrip(os.path.sep).count(os.path.sep)
            if current_level - start_level >= 2:
                dirs[:] = [] # Stop traversing deeper
                
            # Filter ignored directories in-place
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
            
            # Check rules
            for rule in rules:
                if any(ind in files for ind in rule["indicators"]):
                    # Found a match
                    service = {
                        "id": f"srv-auto-{int(time.time()*1000)}-{len(discovered_services)}",
                        "name": f"{rule['language']} Service ({os.path.basename(root) or 'Root'})",
                        "path": root.replace('\\', '/'),
                        "command": rule["command"],
                        "use_venv": rule["use_venv"],
                        "language": rule["language"],
                        "venv_path": ""
                    }
                    
                    # Refine python command if specific files exist
                    if rule["language"] == "Python":
                        if "manage.py" in files:
                            service["command"] = "python manage.py runserver"
                        elif "main.py" in files:
                            service["command"] = "python main.py"
                            
                        # Look for venv
                        for v_folder in rule["venv_folders"]:
                            if v_folder in dirs:
                                service["venv_path"] = os.path.join(root, v_folder).replace('\\', '/')
                                break
                    
                    # Refine node command if package.json has scripts
                    if rule["language"] == "Node.js":
                        npm_scripts = self.get_npm_scripts(root)
                        if "dev" in npm_scripts:
                            service["command"] = "npm run dev"
                        elif "start" in npm_scripts:
                            service["command"] = "npm start"
                    
                    discovered_services.append(service)
                    break # Usually one primary service per folder
                    
        return discovered_services

    def get_installed_languages(self):
        import shutil
        installed = []
        
        # Python is always installed since we are running a python app
        installed.append("Python")
            
        if shutil.which("node") or shutil.which("npm"):
            installed.append("Node.js")
            
        if shutil.which("go"):
            installed.append("Go")
            
        if shutil.which("rustc") or shutil.which("cargo"):
            installed.append("Rust")
            
        # "Other" / Shell is always available
        installed.append("Other")
        
        logger.info(f"Detected installed languages on system: {installed}")
        return installed

    def open_pip(self):
        """Open the PiP floating overlay window (starts hidden; shown when main loses focus)."""
        if self._pip_window is not None:
            logger.info("PiP window already open.")
            return True

        logger.info("Opening PiP overlay window...")
        try:
            # Build the URL — use #pip hash (query params break on file:// URLs)
            if DEBUG:
                pip_url = 'http://localhost:5173/#pip'
            else:
                html_path = os.path.join(self.base_dir, 'gui', 'dist', 'index.html')
                pip_url = f'file:///{html_path.replace(chr(92), "/")}#pip'

            pip_w = 280
            pip_h = 48
            
            init_x = None
            init_y = None
            try:
                import screeninfo
                monitors = screeninfo.get_monitors()
                if monitors:
                    m = next((m for m in monitors if m.is_primary), monitors[0])
                    init_x = int(m.x + m.width - pip_w - 20)
                    init_y = int(m.y + m.height - pip_h - 60)
            except Exception as se:
                logger.error(f"screeninfo error before pip creation: {se}")

            pip_win = webview.create_window(
                'Servo PiP',
                pip_url,
                js_api=self,
                width=pip_w,
                height=pip_h,
                x=init_x,
                y=init_y,
                min_size=(100, 30),
                frameless=True,
                on_top=True,
                background_color='#09090b',
                shadow=True,
                hidden=True
            )
            self._pip_window = pip_win

            # When the user closes the PiP via its own X button, clear the reference
            def _on_pip_closed():
                logger.info("PiP window closed by user.")
                self._pip_window = None
            pip_win.events.closed += _on_pip_closed

            if os.name == 'nt':
                def _init_pip():
                    import time, ctypes
                    time.sleep(0.6)  # Wait for window handle to be ready
                    try:
                        # Position in bottom-right corner
                        # Hide immediately if main window is currently in focus
                        main_hwnd = self._window.native.Handle.ToInt32()
                        fg = ctypes.windll.user32.GetForegroundWindow()
                        if fg == main_hwnd:
                            pip_win.hide()
                            logger.info("PiP hidden on startup — main window is active.")
                    except Exception as e:
                        logger.error(f"PiP init failed: {e}")

                threading.Thread(target=_init_pip, daemon=True).start()
                # Start the focus monitor
                threading.Thread(target=self._pip_focus_monitor, daemon=True).start()

            logger.info("PiP overlay window created.")
            return True
        except Exception as e:
            logger.error(f"Failed to open PiP window: {e}", exc_info=True)
            return False

    def close_pip(self):
        """Close the PiP overlay window."""
        if self._pip_window is not None:
            logger.info("Closing PiP overlay window...")
            try:
                self._pip_window.destroy()
            except Exception as e:
                logger.error(f"Error closing PiP window: {e}")
            finally:
                self._pip_window = None
            return True
        return False

    def show_toast_window(self, title, message):
        """Spawns a highly reliable native Windows notification."""
        try:
            logger.info(f"Triggering native Windows notification: '{title}'")
            
            def _send_toast():
                try:
                    from win11toast import toast
                    toast(title, message, app_id="Servo Dashboard")
                    logger.info("Native toast sent successfully.")
                except Exception as e:
                    logger.error(f"win11toast failed: {e}")

            import threading
            threading.Thread(target=_send_toast, daemon=True).start()
            
        except Exception as e:
            logger.error(f"Failed to initiate native toast: {e}", exc_info=True)

    def _pip_focus_monitor(self):
        """Background thread: show PiP when main loses focus/minimizes, hide when main is active."""
        import ctypes, time
        user32 = ctypes.windll.user32

        # Wait briefly for both window handles to be available
        time.sleep(0.8)

        while self._pip_window is not None:
            time.sleep(0.3)
            try:
                pip_win = self._pip_window
                if pip_win is None:
                    break

                main_hwnd = self._window.native.Handle.ToInt32()
                pip_hwnd  = pip_win.native.Handle.ToInt32()
                fg        = user32.GetForegroundWindow()

                main_is_active   = (fg == main_hwnd)
                pip_is_active    = (fg == pip_hwnd)
                main_is_minimized = bool(user32.IsIconic(main_hwnd))
                pip_is_visible   = bool(user32.IsWindowVisible(pip_hwnd))

                statuses = self.get_statuses()
                any_running = "Running" in statuses.values()

                if not any_running or (main_is_active and not main_is_minimized):
                    # No services running OR Main window is in the foreground — hide PiP
                    if pip_is_visible:
                        try:
                            import ctypes
                            hwnd = pip_win.native.Handle.ToInt32()
                            ctypes.windll.user32.ShowWindow(hwnd, 0) # SW_HIDE
                        except Exception:
                            pip_win.hide()
                        logger.debug("PiP hidden — main window active or no services running.")
                    if main_is_active and not main_is_minimized:
                        self._pip_paused = False  # reset so PiP reappears next time
                elif (main_is_minimized or not main_is_active) and not pip_is_active:
                    # Main is minimized OR user switched to another app AND services are running — show PiP
                    if not pip_is_visible and not self._pip_paused:
                        try:
                            import ctypes
                            hwnd = pip_win.native.Handle.ToInt32()
                            ctypes.windll.user32.ShowWindow(hwnd, 8) # SW_SHOWNA
                        except Exception:
                            pip_win.show()
                        logger.debug("PiP shown — main window inactive/minimized and services running.")
            except Exception as e:
                logger.debug(f"PiP monitor error: {e}")

        logger.info("PiP focus monitor thread exited.")

    def minimize_pip(self):
        """Minimize (hide for this session) the PiP overlay. It reappears next time main loses focus."""
        if self._pip_window is not None:
            logger.info("PiP minimized by user.")
            self._pip_paused = True
            try:
                self._pip_window.minimize()
            except Exception as e:
                logger.error(f"Error minimizing PiP: {e}")
            return True
        return False

    def resize_pip(self, width: int, height: int):
        """Resize the PiP window."""
        if self._pip_window is not None:
            try:
                self._pip_window.resize(width, height)
                logger.info(f"PiP resized to {width}x{height}")
                return True
            except Exception as e:
                logger.error(f"Error resizing PiP: {e}")
        return False

    def focus_main_window(self):
        """Bring the main application window to the foreground."""
        if self._window is not None:
            logger.info("Focusing main window from PiP request.")
            try:
                self._window.restore()
                if os.name == 'nt':
                    import ctypes
                    hwnd = self._window.native.Handle.ToInt32()
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
            except Exception as e:
                logger.error(f"Error focusing main window: {e}")
            return True
        return False

    def get_pip_data(self):
        """Return all projects and their current service statuses for the PiP window."""
        projects = self._load_from_json()
        statuses = self.get_statuses()
        return {"projects": projects, "statuses": statuses}
