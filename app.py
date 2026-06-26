import os
import sys
import json
import signal
import subprocess
import threading
import logging
from logging.handlers import RotatingFileHandler
import webview

DEBUG = False  # Set to False to run from built assets

# Stderr redirection removed to prevent deadlocks on window close

# Setup logging configuration (writes to workspace servo.log and console stdout)
log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'servo.log')
file_handler = RotatingFileHandler(log_file_path, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8')
stream_handler = logging.StreamHandler(sys.stdout)

# Filter out native Windows accessibility interop recursion errors and automation warnings from pywebview log streams
class AccessibilityLogFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        
        # Format exception traceback if present to scan for recursion details
        exc_msg = ""
        if record.exc_info:
            import traceback
            exc_msg = "".join(traceback.format_exception(*record.exc_info))
            
        combined = (msg + "\n" + exc_msg).lower()
        
        ignore_keywords = [
            "accessibilityobject",
            "recursion depth exceeded",
            "window.native",
            "corewebview2",
            "ui thread",
            "folder_dialog is deprecated",
            "syncroot",
            "bold",
            "font"
        ]
        
        if any(keyword in combined for keyword in ignore_keywords):
            return False
        return True

log_filter = AccessibilityLogFilter()
file_handler.addFilter(log_filter)
stream_handler.addFilter(log_filter)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) - %(message)s',
    handlers=[file_handler, stream_handler]
)
logger = logging.getLogger("servo")

class Api:
    def __init__(self):
        self.lock = threading.Lock()
        self.processes = {}  # key (project_id_service_id) -> Process Object
        self.logs = {}  # key (project_id_service_id) -> list of log lines
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.storage_path = os.path.join(self.base_dir, 'storage.json')
        self._window = None
        self._pip_window = None
        self._pip_paused = False  # True when user manually minimized/hid the PiP
        logger.info("Initialized Python IPC Api handler.")
        
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
        key = f"{project_id}_{service_id}"
        with self.lock:
            proc = self.processes.get(key)
            if hasattr(proc, 'write'):
                try:
                    proc.write(data)
                    
                    if data == '\x03':
                        # The user pressed Ctrl+C. Try to aggressively kill any running child commands
                        # inside the winpty terminal (like npm run dev) so they don't get stuck.
                        try:
                            import psutil
                            import subprocess
                            agent_proc = psutil.Process(proc.pid)
                            for shell_proc in agent_proc.children():
                                for cmd_proc in shell_proc.children():
                                    subprocess.run(f"taskkill /F /T /PID {cmd_proc.pid}", shell=True, capture_output=True)
                        except Exception as e:
                            logger.debug(f"Aggressive Ctrl+C psutil kill failed: {e}")
                    
                    return True
                except Exception as e:
                    logger.error(f"Failed to write to {key} winpty: {e}")
            elif proc and hasattr(proc, 'stdin') and proc.stdin:
                try:
                    proc.stdin.write(data.encode('utf-8'))
                    proc.stdin.flush()
                    return True
                except Exception as e:
                    logger.error(f"Failed to write to {key} stdin: {e}")
        return False

    def _read_stream_winpty(self, key, pty):
        try:
            import json
            import time
            import psutil
            
            shell_pid = pty.pid
            empty_reads = 0
            
            while True:
                # read without blocking continuously, with small sleep
                text = pty.read(blocking=False)
                if text:
                    empty_reads = 0
                    
                    with self.lock:
                        if key not in self.logs:
                            self.logs[key] = []
                        self.logs[key].append(text)
                        if len(self.logs[key]) > 2000:
                            self.logs[key] = self.logs[key][-2000:]
                            
                    escaped = json.dumps(text)[1:-1]
                    if self._window:
                        try:
                            self._window.evaluate_js(f"if (window.writeToTerminalUI) window.writeToTerminalUI('{key}', \"{escaped}\");")
                        except Exception:
                            pass
                else:
                    empty_reads += 1
                    if not pty.isalive():
                        break
                        
                    # winpty's isalive() tracks the agent which can outlive the shell
                    # check if the actual shell process has exited periodically
                    if empty_reads % 50 == 0:
                        try:
                            if not psutil.pid_exists(shell_pid):
                                break
                        except Exception:
                            pass
                            
                    time.sleep(0.01)
        except Exception as e:
            logger.debug(f"Winpty stream reading exited for service {key}: {e}")
        finally:
            with self.lock:
                if key in self.processes and self.processes[key] == pty:
                    del self.processes[key]
                    if key in self.logs:
                        self.logs[key].append("[SYSTEM] Console session closed.")

    def _read_stream(self, key, stream, stream_name):
        try:
            import json
            while True:
                # Read chunks to support interactive prompt rendering without blocking
                chunk = stream.read(1024)
                if not chunk:
                    break
                text = chunk.decode('utf-8', errors='replace')
                
                with self.lock:
                    if key not in self.logs:
                        self.logs[key] = []
                    self.logs[key].append(text)
                    if len(self.logs[key]) > 2000:
                        self.logs[key] = self.logs[key][-2000:]
                        
                escaped = json.dumps(text)[1:-1] # escape safely for JS
                if self._window:
                    try:
                        self._window.evaluate_js(f"if (window.writeToTerminalUI) window.writeToTerminalUI('{key}', \"{escaped}\");")
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Pipe stream reading exited for service {key}: {e}")
        finally:
            stream.close()
            with self.lock:
                if key in self.processes:
                    proc = self.processes[key]
                    if hasattr(proc, 'stdout') and proc.stdout == stream:
                        del self.processes[key]
                        if key in self.logs:
                            self.logs[key].append("[SYSTEM] Process stream closed.")

    def load_projects(self):
        return self._load_from_json()

    def save_project(self, project_json):
        if isinstance(project_json, str):
            project = json.loads(project_json)
        else:
            project = project_json
            
        project_id = project.get('id')
        project_name = project.get('name')
        
        with self.lock:
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
        with self.lock:
            projects = self._load_from_json()
            projects = [p for p in projects if p.get('id') != project_id]
            self._write_to_json(projects)
            
            # Clean up logs for deleted project's services
            prefix = f"{project_id}_"
            for key in list(self.logs.keys()):
                if key.startswith(prefix):
                    del self.logs[key]
            logger.info(f"Deleted project config for ID: {project_id}")
            return True

    def start_service(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            projects = self._load_from_json()
            project = next((p for p in projects if p.get('id') == project_id), None)
            if not project:
                logger.warning(f"Start failed: project ID {project_id} does not exist.")
                return False
                
            service = next((s for s in project.get('services', []) if s.get('id') == service_id), None)
            if not service:
                logger.warning(f"Start failed: service ID {service_id} does not exist in project {project_id}.")
                return False
                
            path = service.get('path')
            command = service.get('command')
            name = f"{project.get('name')} - {service.get('name')}"
            venv_path = service.get('venv_path')
            use_venv = service.get('use_venv', True)
            
            if not path or not command:
                logger.warning(f"Start failed for service {key}: Missing path or command parameters.")
                return False

            # Check if service is already running
            if key in self.processes:
                proc = self.processes[key]
                is_busy = False
                if os.name == 'nt':
                    try:
                        import psutil
                        proc_obj = psutil.Process(proc.pid)
                        children = [c for c in proc_obj.children(recursive=True) if c.name().lower() != 'conhost.exe']
                        if hasattr(proc, 'isalive'):
                            is_busy = len(children) > 1 and proc.isalive()
                        else:
                            is_busy = len(children) > 0 and proc.poll() is None
                    except Exception:
                        if hasattr(proc, 'isalive'):
                            is_busy = proc.isalive()
                        else:
                            is_busy = proc.poll() is None
                else:
                    if hasattr(proc, 'isalive'):
                        is_busy = proc.isalive()
                    else:
                        is_busy = proc.poll() is None

                if is_busy:
                    logger.info(f"Start ignored: service {key} is already running.")
                    return True
                else:
                    logger.info(f"Terminal for {key} is idle. Sending command to existing terminal.")
                    if hasattr(proc, 'write'):
                        proc.write(command + '\r\n')
                    elif hasattr(proc, 'stdin') and proc.stdin:
                        proc.stdin.write((command + '\r\n').encode('utf-8'))
                        proc.stdin.flush()
                    return True
                
            logger.info(f"Attempting to launch service '{name}' (Key: {key}). CWD: '{path}', Cmd: '{command}', Venv: '{venv_path}'")
            try:
                # Handle path resolving
                expanded_path = os.path.expanduser(path)
                
                # Setup custom environment variables for virtual environments
                process_env = os.environ.copy()
                if venv_path and use_venv:
                    expanded_venv = os.path.expanduser(venv_path)
                    venv_bin = os.path.join(expanded_venv, 'Scripts') if os.name == 'nt' else os.path.join(expanded_venv, 'bin')
                    process_env['PATH'] = venv_bin + os.pathsep + process_env.get('PATH', '')
                    process_env['VIRTUAL_ENV'] = expanded_venv
                    logger.info(f"Prepending virtual environment PATH prefix: '{venv_bin}' for service '{name}'")
                elif venv_path:
                    logger.info(f"Virtual environment path activation disabled by user configuration for service '{name}'")
                
                # Setup process preexec_fn for macOS/Linux to set session id (to kill children)
                preexec = None
                if os.name != 'nt':
                    preexec = os.setsid
                
                if os.name == 'nt':
                    try:
                        import winpty
                        # Initialize PTY for an 80x24 terminal
                        pty = winpty.PTY(80, 24)
                        
                        # Set up environment variables as a dictionary
                        # winpty expects env to be a null-terminated string of KEY=VALUE pairs
                        pty_env = '\0'.join([f"{k}={v}" for k, v in process_env.items()]) + '\0'
                        
                        # Spawn the process in the PTY without any arguments so it boots a pure interactive shell
                        pty.spawn('powershell.exe', cwd=expanded_path, env=pty_env)
                        
                        self.processes[key] = pty
                        self.logs[key] = [f"[SYSTEM] Service started in winpty embedded console\r\n"]
                        logger.info(f"Service '{name}' successfully started with winpty.")
                        
                        # Clear frontend terminal for the new process
                        if self._window:
                            try:
                                self._window.evaluate_js(f"if (window.__terminals && window.__terminals['{key}']) window.__terminals['{key}'].reset();")
                            except Exception:
                                pass
                        
                        # Start background thread to drain PTY
                        t_out = threading.Thread(target=self._read_stream_winpty, args=(key, pty), daemon=True)
                        t_out.start()
                        
                        # Automatically 'type' the command into the shell so the user sees it at the prompt
                        import time
                        def write_cmd():
                            time.sleep(0.5) # Wait for powershell to boot and show prompt
                            pty.write(command + '\r\n')
                        threading.Thread(target=write_cmd, daemon=True).start()
                    except ImportError:
                        logger.warning("pywinpty not installed. Falling back to subprocess pipes.")
                        import base64
                        creation_flags = subprocess.CREATE_NO_WINDOW
                        encoded_cmd = base64.b64encode(command.encode('utf-16-le')).decode('utf-8')
                        ps_cmd = f'powershell.exe -NoExit -EncodedCommand {encoded_cmd}'
                        
                        proc = subprocess.Popen(
                            ps_cmd,
                            cwd=expanded_path,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,
                            stdin=subprocess.PIPE,
                            bufsize=0,
                            creationflags=creation_flags,
                            env=process_env
                        )
                        self.processes[key] = proc
                        self.logs[key] = [f"[SYSTEM] Service started in embedded console with PID {proc.pid}"]
                        if hasattr(proc, 'stdout') and proc.stdout:
                            t_out = threading.Thread(target=self._read_stream, args=(key, proc.stdout, "STDOUT"), daemon=True)
                            t_out.start()

                else:
                    proc = subprocess.Popen(
                        command,
                        shell=True,
                        cwd=expanded_path,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        stdin=subprocess.PIPE,
                        bufsize=0,
                        preexec_fn=preexec,
                        env=process_env
                    )
                
                    self.processes[key] = proc
                    self.logs[key] = [f"[SYSTEM] Service started in embedded console with PID {proc.pid}\r\n"]
                    logger.info(f"Service '{name}' successfully started. Process PID: {proc.pid}")
                    
                    # Clear frontend terminal for the new process
                    if self._window:
                        try:
                            self._window.evaluate_js(f"if (window.__terminals && window.__terminals['{key}']) window.__terminals['{key}'].reset();")
                        except Exception:
                            pass
                    
                    if hasattr(proc, 'stdout') and proc.stdout:
                        t_out = threading.Thread(target=self._read_stream, args=(key, proc.stdout, "STDOUT"), daemon=True)
                        t_out.start()
                
                return True
            except Exception as e:
                self.logs[key] = [f"[SYSTEM] Failed to start service: {str(e)}"]
                logger.error(f"Exception spawning service {key}: {e}", exc_info=True)
                return False

    def stop_service(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            proc = self.processes.get(key)
            if not proc:
                logger.debug(f"Stop ignored: service {key} is not running.")
                return False
                
            logger.info(f"Attempting to stop process tree for service key: {key} (PID: {proc.pid})")
            try:
                # If the process is an interactive PTY, send Ctrl+C instead of killing the shell
                if hasattr(proc, 'write'):
                    proc.write('\x03')
                    if key in self.logs:
                        self.logs[key].append("[SYSTEM] Sent Ctrl+C to terminal. Terminal remains interactive.\r\n")
                    logger.info(f"Sent Ctrl+C to interactive terminal for service key: {key}")
                    return True

                if os.name == 'nt':
                    # Windows: Forcefully terminate process tree
                    subprocess.run(f"taskkill /F /T /PID {proc.pid}", shell=True, capture_output=True)
                else:
                    # Unix/macOS: Terminate process group
                    try:
                        pgid = os.getpgid(proc.pid)
                        os.killpg(pgid, signal.SIGTERM)
                    except Exception:
                        proc.terminate()
                
                if key in self.logs:
                    self.logs[key].append("[SYSTEM] Service stopped by user.")
                
                if key in self.processes:
                    del self.processes[key]
                logger.info(f"Successfully stopped process tree for service key: {key}")
                return True
            except Exception as e:
                logger.error(f"Exception stopping service {key}: {e}", exc_info=True)
                return False

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
        with self.lock:
            statuses = {}
            projects = self._load_from_json()
            for p in projects:
                p_id = p.get('id')
                for s in p.get('services', []):
                    s_id = s.get('id')
                    key = f"{p_id}_{s_id}"
                    proc = self.processes.get(key)
                    if proc:
                        poll = None
                        if os.name == 'nt':
                            try:
                                import psutil
                                proc_obj = psutil.Process(proc.pid)
                                children = [c for c in proc_obj.children(recursive=True) if c.name().lower() != 'conhost.exe']
                                if hasattr(proc, 'isalive'):
                                    if not proc.isalive():
                                        poll = 1
                                    else:
                                        poll = None if len(children) > 1 else 0
                                else:
                                    if proc.poll() is not None:
                                        poll = proc.poll()
                                    else:
                                        poll = None if len(children) > 0 else 0
                            except Exception:
                                if hasattr(proc, 'isalive'):
                                    poll = None if proc.isalive() else 1
                                else:
                                    poll = proc.poll()
                        else:
                            if hasattr(proc, 'isalive'):
                                poll = None if proc.isalive() else 1
                            else:
                                poll = proc.poll()
                                
                        if poll is None:
                            statuses[key] = "Running"
                        elif poll == 0:
                            statuses[key] = "Idle"
                        else:
                            statuses[key] = "Error"
                    else:
                        statuses[key] = "Idle"
            return statuses

    def get_logs(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            return self.logs.get(key, [])

    def clear_logs(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            if key in self.logs:
                self.logs[key] = ["[SYSTEM] Logs cleared."]
            logger.info(f"Cleared virtual console logs buffer for service {key}")
            return True

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

            pip_win = webview.create_window(
                'Servo PiP',
                pip_url,
                js_api=self,
                width=pip_w,
                height=pip_h,
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
                        class RECT(ctypes.Structure):
                            _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                                        ('right', ctypes.c_long), ('bottom', ctypes.c_long)]
                        work = RECT()
                        ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(work), 0)
                        hwnd = pip_win.native.Handle.ToInt32()
                        x = work.right - pip_w - 20
                        y = work.bottom - pip_h - 20
                        HWND_TOPMOST = -1
                        SWP_NOACTIVATE = 0x0010
                        SWP_NOSIZE = 0x0001
                        ctypes.windll.user32.SetWindowPos(hwnd, HWND_TOPMOST, x, y, 0, 0, SWP_NOACTIVATE | SWP_NOSIZE)
                        logger.info(f"PiP window positioned at ({x},{y})")

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

if __name__ == '__main__':
    logger.info("=========================================")
    logger.info("Starting Servo Developer Dashboard client")
    logger.info("=========================================")
    
    api = Api()
    
    # Ensure storage.json is created
    if not os.path.exists(api.storage_path):
        logger.info(f"Initializing empty storage DB at: {api.storage_path}")
        api._write_to_json([])
        
    if DEBUG:
        url = 'http://localhost:5173'
        logger.info("Running in development mode (hot-reloading localhost:5173)")
    else:
        html_path = os.path.join(api.base_dir, 'gui', 'dist', 'index.html')
        if not os.path.exists(html_path):
            logger.warning(f"Production assets not found at {html_path}! Falling back to localhost:5173")
            url = 'http://localhost:5173'
        else:
            url = f'file:///{html_path.replace(chr(92), "/")}'
            logger.info(f"Loading compiled client assets from: {url}")
            
    window = webview.create_window(
        'Language-Agnostic Developer Dashboard',
        url,
        js_api=api,
        width=1280,
        height=850,
        background_color='#09090b'
    )
    api._window = window

    # Stop all running child processes when the window closes to prevent orphan hangs
    def on_closed():
        logger.info("Window closed. Stopping all running project subprocesses...")
        for key in list(api.processes.keys()):
            try:
                parts = key.split('_', 1)
                if len(parts) == 2:
                    api.stop_service(parts[0], parts[1])
            except Exception as e:
                logger.error(f"Failed to stop service {key} on window close: {e}", exc_info=True)
        
        logger.info("Cleanup complete. Forcefully terminating process to prevent ghost windows...")
        import os
        import sys
        sys.stdout.flush()
        os._exit(0)
        
    window.events.closed += on_closed



    # Automated CLI test hook to close the GUI window after it fully boots
    if '--auto-close' in sys.argv:
        def close_window_later():
            import time
            time.sleep(8)
            logger.info("Auto-close trigger: destroying desktop window...")
            try:
                window.destroy()
            except Exception as e:
                logger.error(f"Error during auto-close window destroy: {e}")
        threading.Thread(target=close_window_later, daemon=True).start()
    # Start global HUD hotkey thread for Windows
    if os.name == 'nt':
        def hotkey_loop():
            import ctypes
            from ctypes import wintypes
            import time
            
            user32 = ctypes.windll.user32
            MOD_ALT = 0x0001
            MOD_CONTROL = 0x0002
            
            # Ctrl+Alt+S (S virtual key is 0x53)
            VK_S = 0x53
            HOTKEY_ID = 99
            
            time.sleep(1.0) # Wait for window to load
            
            if not user32.RegisterHotKey(None, HOTKEY_ID, MOD_CONTROL | MOD_ALT, VK_S):
                logger.warning("Could not register global hotkey Ctrl+Alt+S (it might already be in use)")
                return
                
            logger.info("Global overlay shortcut registered: Ctrl+Alt+S")
            
            try:
                msg = wintypes.MSG()
                while user32.GetMessageA(ctypes.byref(msg), None, 0, 0) != 0:
                    if msg.message == 0x0312: # WM_HOTKEY
                        if msg.wParam == HOTKEY_ID:
                            active = webview.active_window()
                            if active == window:
                                window.minimize()
                            else:
                                window.show()
                                window.restore()
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageA(ctypes.byref(msg))
            except Exception as e:
                logger.error(f"Error in global hotkey message loop: {e}")
            finally:
                user32.UnregisterHotKey(None, HOTKEY_ID)
                logger.info("Global overlay shortcut unregistered.")
                
        threading.Thread(target=hotkey_loop, daemon=True).start()

    try:
        webview.start(gui='edgechromium', debug=DEBUG)
    except Exception as e:
        logger.error(f"webview.start encountered an error: {e}", exc_info=True)
        sys.exit(1)
