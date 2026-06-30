import os
import json
import threading
import subprocess
import webview
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from backend.logger import logger
from backend.process_manager import ProcessManager

from backend.config import DEBUG, STORAGE_FILE
from backend.mixins.docker_mixin import DockerMixin
from backend.mixins.window_mixin import WindowMixin

class Api(DockerMixin, WindowMixin):
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        import sys
        if sys.platform == 'win32':
            app_data_dir = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'Servo')
        else:
            app_data_dir = os.path.join(os.path.expanduser('~'), '.servo')
        os.makedirs(app_data_dir, exist_ok=True)
        self.storage_path = os.path.join(app_data_dir, STORAGE_FILE)
        self.storage_lock = threading.RLock()
        self.__window = None
        
        # Initialize Watchdog Observer
        self._observer = Observer()
        self._observer.start()
        self._watch_paths = {} # Maps project_path -> watchdog watch object
        
        class ConfigHandler(FileSystemEventHandler):
            def __init__(self, api_instance):
                self.api = api_instance
                self.last_trigger = 0
            
            def on_modified(self, event):
                if not event.is_directory and event.src_path.endswith('.servo.json'):
                    now = time.time()
                    if now - self.last_trigger > 1.0: # Debounce 1 second
                        self.last_trigger = now
                        logger.info(f"Detected external change in {event.src_path}")
                        if self.api._Api__window:
                            self.api._Api__window.evaluate_js("window.dispatchEvent(new CustomEvent('servo-config-changed'));")

        self._config_handler = ConfigHandler(self)
        
        self._pip_window = None
        self._pip_paused = False
        
        # Pass self.load_projects to ProcessManager so it can resolve services
        self._process_manager = ProcessManager(self.load_projects, api=self)
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

    def resize_terminal(self, project_id, service_id, cols, rows):
        return self._process_manager.resize_terminal(project_id, service_id, cols, rows)

    def check_docker_status(self):
        try:
            import subprocess
            result = subprocess.run(
                ["docker", "info"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                timeout=3
            )
            return result.returncode == 0
        except Exception:
            return False

    def load_projects(self):
        index = self._load_from_json()
        full_projects = []
        valid_index = []
        index_changed = False
        
        for p in index:
            proj = dict(p)
            proj_path = p.get('path', '')
            proj['path'] = proj_path
            
            if not os.path.exists(proj_path):
                logger.warning(f"Project path missing, removing from database: {proj_path}")
                index_changed = True
                continue
                
            servo_file = os.path.join(proj_path, '.servo.json')
            if not os.path.exists(servo_file):
                logger.warning(f"Project missing .servo.json, removing from database: {proj_path}")
                index_changed = True
                continue
                
            try:
                with open(servo_file, 'r', encoding='utf-8') as f:
                    servo_data = json.load(f)
                
                services = servo_data.get('services', [])
                valid_services = []
                services_changed = False
                
                for s in services:
                    s['raw_path'] = s.get('path', '.')
                    s['raw_venv_path'] = s.get('venv_path', '')
                    
                    s['path'] = os.path.abspath(os.path.join(proj_path, s['raw_path'])).replace('\\', '/')
                    if not os.path.exists(s['path']):
                        logger.warning(f"Service path missing, removing service '{s.get('name')}': {s['path']}")
                        services_changed = True
                        continue
                        
                    if s['raw_venv_path']:
                        s['venv_path'] = os.path.abspath(os.path.join(proj_path, s['raw_venv_path'])).replace('\\', '/')
                        if not os.path.exists(s['venv_path']):
                            logger.warning(f"Virtual environment path missing for service '{s.get('name')}': {s['venv_path']}")
                            s['raw_venv_path'] = ''
                            s['venv_path'] = ''
                            services_changed = True
                            
                    valid_services.append(s)
                    
                if services_changed:
                    servo_data['services'] = valid_services
                    with open(servo_file, 'w', encoding='utf-8') as f:
                        json.dump(servo_data, f, indent=2)
                        
                proj['services'] = valid_services
                proj['health_status'] = 'active'
                valid_index.append(p)
                full_projects.append(proj)
            except Exception as e:
                logger.error(f"Error parsing {servo_file}: {e}")
                
        if index_changed:
            self._write_to_json(valid_index)
            
        # Setup watchers for any active projects
        self._setup_watchers(full_projects)
        return full_projects
        
    def _setup_watchers(self, full_projects):
        current_paths = set(p.get('path', '') for p in full_projects if p.get('health_status') == 'active')
        
        # Remove old watches
        for path in list(self._watch_paths.keys()):
            if path not in current_paths:
                watch = self._watch_paths.pop(path, None)
                if watch:
                    try:
                        self._observer.unschedule(watch)
                    except Exception as e:
                        logger.debug(f"Error unscheduling watch for {path}: {e}")
                
        # Add new watches
        for path in current_paths:
            if path and path not in self._watch_paths and os.path.exists(path):
                watch = self._observer.schedule(self._config_handler, path, recursive=False)
                self._watch_paths[path] = watch

    def save_project(self, project_json):
        if isinstance(project_json, str):
            project = json.loads(project_json)
        else:
            project = project_json
            
        project_id = project.get('id')
        project_name = project.get('name')
        
        with self.storage_lock:
            # 1. Update Global Index
            projects = self._load_from_json()
            exists = False
            for i, p in enumerate(projects):
                if p.get('id') == project_id:
                    # Update name/category/path if they changed
                    p['name'] = project_name
                    if 'category' in project: p['category'] = project.get('category')
                    if 'path' in project: p['path'] = project.get('path')
                    exists = True
                    break
            if not exists:
                projects.append({
                    'id': project_id,
                    'name': project_name,
                    'category': project.get('category', ''),
                    'path': project.get('path', '')
                })
            self._write_to_json(projects)
            
            # 2. Write to .servo.json
            proj_path = project.get('path', '')
            if os.path.exists(proj_path):
                servo_file = os.path.join(proj_path, '.servo.json')
                
                # Convert back to relative paths for storage
                services_to_save = []
                for s in project.get('services', []):
                    new_s = dict(s)
                    new_s.pop('raw_path', None)
                    new_s.pop('raw_venv_path', None)
                    
                    abs_path = s.get('path', '')
                    if abs_path:
                        try:
                            rel_p = os.path.relpath(abs_path, proj_path).replace('\\', '/')
                            new_s['path'] = rel_p if rel_p != '.' else '.'
                        except ValueError:
                            pass
                            
                    abs_venv = s.get('venv_path', '')
                    if abs_venv:
                        try:
                            new_s['venv_path'] = os.path.relpath(abs_venv, proj_path).replace('\\', '/')
                        except ValueError:
                            pass
                            
                    services_to_save.append(new_s)
                    
                servo_data = {
                    "_warning": "AUTO-GENERATED BY SERVO. DO NOT EDIT. Manual changes may corrupt your project configuration.",
                    "version": "1.0",
                    "project_id": project_id,
                    "services": services_to_save
                }
                
                tmp_file = servo_file + '.tmp'
                try:
                    with open(tmp_file, 'w', encoding='utf-8') as f:
                        json.dump(servo_data, f, indent=2)
                    os.replace(tmp_file, servo_file)
                except Exception as e:
                    logger.error(f"Failed to save .servo.json: {e}")
            
            logger.info(f"Saved project: '{project_name}' (ID: {project_id})")
            return True

    def delete_project(self, project_id):
        logger.info(f"Request to delete project ID: {project_id}")
        self.stop_project(project_id)
        index = self._load_from_json()
        new_index = [p for p in index if p.get('id') != project_id]
        if len(new_index) < len(index):
            self._write_to_json(new_index)
            self._process_manager.cleanup_logs_for_project(project_id)
            logger.info(f"Deleted project config for ID: {project_id}")
            return True
        return False

    def read_env_file(self, file_path):
        """Reads .env file and returns a dictionary of parsed values."""
        try:
            from dotenv import dotenv_values
        except ImportError:
            logger.warning("python-dotenv not installed, cannot parse .env file natively.")
            return {}
            
        try:
            if not os.path.exists(file_path):
                return {}
                
            parsed = dotenv_values(file_path)
            return {k: str(v) for k, v in parsed.items() if v is not None}
        except Exception as e:
            logger.error(f"Failed to read .env file at {file_path}: {e}")
            return {}
        
    def import_project(self, folder_path=None):
        folder = folder_path if folder_path else self.pick_folder()
        if not folder:
            return False
            
        servo_file = os.path.join(folder, '.servo.json')
        if not os.path.exists(servo_file):
            self.show_toast_window("Import Failed", "No .servo.json found in the selected directory.")
            return False
            
        try:
            with open(servo_file, 'r', encoding='utf-8') as f:
                proj_data = json.load(f)
                
            index = self._load_from_json()
            # Check if it already exists
            proj_id = proj_data.get('project_id')
            if any(p.get('id') == proj_id or os.path.normcase(os.path.abspath(p.get('path', ''))) == os.path.normcase(os.path.abspath(folder)) for p in index):
                self.show_toast_window("Import Failed", "This project is already connected.")
                return False
                
            new_id = proj_id if proj_id else f"proj-{int(time.time()*1000)}"
            
            # Derive name and category
            name = "Imported Project"
            category = "Imported"
            
            # Use the first service's name as project name if available
            services = proj_data.get('services', [])
            if services and len(services) > 0:
                name = services[0].get('name', name)
                category = services[0].get('language', category)
                
            index.append({
                "id": new_id,
                "name": name,
                "category": category,
                "path": folder
            })
            
            self._write_to_json(index)
            
            if self.__window:
                self.__window.evaluate_js("window.dispatchEvent(new CustomEvent('servo-config-changed'));")
            return True
            
        except Exception as e:
            logger.error(f"Failed to import project: {e}")
            self.show_toast_window("Import Failed", f"Invalid .servo.json format: {e}")
            return False

    def start_service(self, project_id, service_id):
        logger.info(f"Request to start service ID: {service_id} for project ID: {project_id}")
        return self._process_manager.start_service(project_id, service_id)

    def install_dependencies(self, project_id, service_id):
        logger.info(f"Request to install dependencies for service ID: {service_id}")
        return self._process_manager.install_dependencies(project_id, service_id)

    def resolve_port_conflict(self, port):
        logger.info(f"Resolving port conflict for port {port}")
        return self._process_manager.resolve_port_conflict(port)

    def check_port_conflict(self, port):
        return self._process_manager.check_port_conflict(port)

    def start_raw_terminal(self, terminal_id, cwd=None):
        return self._process_manager.start_raw_terminal(terminal_id, cwd)

    def stop_service(self, project_id, service_id):
        return self._process_manager.stop_service(project_id, service_id)

    def warmup_service_terminal(self, project_id, service_id):
        return self._process_manager.warmup_service_terminal(project_id, service_id)

    def start_project(self, project_id):
        logger.info(f"Request to start all services for project ID: {project_id}")
        projects = self.load_projects()
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return False
        success = True
        for s in project.get('services', []):
            if not self.start_service(project_id, s.get('id')):
                success = False
                
        # Start proxy if applicable
        self._process_manager.start_project_proxy(project_id, project)
        
        return success

    def stop_project(self, project_id):
        logger.info(f"Request to stop all services for project ID: {project_id}")
        projects = self.load_projects()
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return False
        for s in project.get('services', []):
            self.stop_service(project_id, s.get('id'))
            
        # Stop proxy
        proxy_key = f"{project_id}_proxy"
        with self._process_manager.lock:
            if proxy_key in self._process_manager.processes:
                proc = self._process_manager.processes[proxy_key]
                try:
                    proc.terminate()
                except Exception as e:
                    logger.error(f"Failed to terminate proxy {proxy_key}: {e}")
                del self._process_manager.processes[proxy_key]
                if proxy_key in self._process_manager.active_ports:
                    del self._process_manager.active_ports[proxy_key]
                    
        return True

    def get_statuses(self):
        return self._process_manager.get_statuses()

    def get_dependency_statuses(self):
        return self._process_manager.get_dependency_statuses()

    def get_metrics(self):
        return self._process_manager.get_metrics()

    def get_active_ports(self):
        return self._process_manager.get_active_ports()

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
                "language": "Docker Compose",
                "indicators": ["docker-compose.yml", "docker-compose.yaml", "compose.yaml", "compose.yml"],
                "command": "docker compose up",
                "use_venv": False,
                "venv_folders": []
            },
            {
                "language": "Docker",
                "indicators": ["Dockerfile"],
                "command": "docker build -t auto-img . && docker run auto-img",
                "use_venv": False,
                "venv_folders": []
            },
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
                matched_ind = next((ind for ind in rule["indicators"] if ind in files), None)
                if matched_ind:
                    # Found a match
                    command = rule["command"]
                    if rule["language"] == "Docker":
                        command = f"docker build -t auto-img -f {matched_ind} . && docker run auto-img"
                    elif rule["language"] == "Docker Compose":
                        command = f"docker compose -f {matched_ind} up"

                    service = {
                        "id": f"srv-auto-{int(time.time()*1000)}-{len(discovered_services)}",
                        "name": f"{rule['language']} Service ({os.path.basename(root) or 'Root'})",
                        "path": root.replace('\\', '/'),
                        "command": command,
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
            
        if shutil.which("docker"):
            installed.append("Docker")
            installed.append("Docker Compose")
            
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



    def get_pip_data(self):
        """Return all projects and their current service statuses for the PiP window."""
        projects = self._load_from_json()
        statuses = self.get_statuses()
        return {"projects": projects, "statuses": statuses}

    # ── Git Integration ──────────────────────────────────────────────────────

    def _run_git(self, args, cwd):
        """Run a git command in the given directory and return (stdout, stderr, returncode)."""
        try:
            kwargs = {
                "cwd": cwd,
                "capture_output": True,
                "text": True,
                "timeout": 10
            }
            if os.name == 'nt':
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
                
            result = subprocess.run(["git"] + args, **kwargs)
            return result.stdout.strip('\r\n'), result.stderr.strip('\r\n'), result.returncode
        except FileNotFoundError:
            return "", "git not found", 1
        except subprocess.TimeoutExpired:
            return "", "git command timed out", 1
        except Exception as e:
            return "", str(e), 1

    def git_get_repos(self, project_id):
        """
        Scan the project's root directory and return a list of discovered Git repositories.
        """
        projects = self._load_from_json()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if not project or not project.get("path"):
            return {"error": "Project not found or path is empty"}
        
        project_root = project.get("path")
        if not os.path.exists(project_root):
            return {"repos": []}
            
        discovered_repos = []
        
        for root, dirs, files in os.walk(project_root):
            # Calculate depth relative to project_root
            rel_path = os.path.relpath(root, project_root)
            depth = 0 if rel_path == '.' else rel_path.count(os.sep) + 1
            
            if depth >= 2:
                dirs.clear() # Don't search too deep
                
            if '.git' in dirs:
                discovered_repos.append(root)
                dirs.remove('.git') # Don't traverse inside .git
                
            # Skip heavy/unrelated directories
            for ignore in ['node_modules', 'venv', '.venv', '__pycache__', 'build', 'dist', '.idea', '.vscode', '.next']:
                if ignore in dirs:
                    dirs.remove(ignore)
        
        repos = []
        for repo_path in discovered_repos:
            # Check if it has a remote
            remote_out, _, _ = self._run_git(["remote", "-v"], repo_path)
            has_remote = len(remote_out.strip()) > 0
            
            repo_name = os.path.basename(repo_path)
            if repo_path == project_root:
                repo_name = f"{project.get('name')} (Root)"
                
            repos.append({
                "path": repo_path.replace('\\', '/'),
                "name": repo_name,
                "has_remote": has_remote
            })
            
        return {"repos": repos}

    def git_get_info(self, project_id, repo_path):
        """
        Return git information for a specific repository: branch, status, recent commits,
        stash list, and remotes.
        """
        projects = self._load_from_json()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if not project:
            return {"error": "Project not found"}

        if not repo_path or not os.path.isdir(repo_path):
            return {"error": "Invalid repository path"}

        # Check if it's actually a git repo
        _, _, rc = self._run_git(["rev-parse", "--is-inside-work-tree"], repo_path)
        if rc != 0:
            return {"error": "Not a git repository"}

        # Get repo root (in case service path is a subdirectory)
        root_out, _, _ = self._run_git(["rev-parse", "--show-toplevel"], repo_path)
        git_root = root_out if root_out else repo_path

        result = {}

        # Current branch
        branch_out, _, _ = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"], git_root)
        result["branch"] = branch_out or "HEAD"

        # All local branches
        branches_out, _, _ = self._run_git(["branch", "--format=%(refname:short)"], git_root)
        result["branches"] = [b for b in branches_out.splitlines() if b] if branches_out else []

        # Uncommitted changes (porcelain format)
        status_out, _, _ = self._run_git(["status", "--porcelain=v1"], git_root)
        changes = []
        if status_out:
            for line in status_out.splitlines():
                if len(line) >= 3:
                    xy = line[:2]
                    filepath = line[3:]
                    index_status = xy[0]
                    worktree_status = xy[1]
                    
                    change_type = "modified"
                    if index_status == "?" and worktree_status == "?":
                        change_type = "untracked"
                    elif index_status == "A":
                        change_type = "added"
                    elif index_status == "D" or worktree_status == "D":
                        change_type = "deleted"
                    elif index_status == "R":
                        change_type = "renamed"
                    elif index_status == "M" or worktree_status == "M":
                        change_type = "modified"
                    
                    staged = index_status not in [" ", "?"]
                    changes.append({
                        "file": filepath,
                        "type": change_type,
                        "staged": staged
                    })
        result["changes"] = changes
        result["has_changes"] = len(changes) > 0

        # Recent commits (last 15)
        log_out, _, _ = self._run_git(
            ["log", "--oneline", "--format=%H|%s|%an|%ar", "-n", "15"],
            git_root
        )
        commits = []
        if log_out:
            for line in log_out.splitlines():
                parts = line.split("|", 3)
                if len(parts) == 4:
                    commits.append({
                        "hash": parts[0][:7],
                        "full_hash": parts[0],
                        "message": parts[1],
                        "author": parts[2],
                        "time": parts[3]
                    })
        result["commits"] = commits

        # Stash list
        stash_out, _, _ = self._run_git(["stash", "list", "--format=%gd: %s"], git_root)
        result["stashes"] = [s for s in stash_out.splitlines() if s] if stash_out else []

        # Remote info
        remote_out, _, _ = self._run_git(["remote", "-v"], git_root)
        remotes = {}
        if remote_out:
            for line in remote_out.splitlines():
                parts = line.split()
                if len(parts) >= 2 and "(fetch)" in line:
                    remotes[parts[0]] = parts[1]
        result["remotes"] = remotes

        # Ahead / behind relative to tracking branch
        ahead_behind_out, _, _ = self._run_git(
            ["rev-list", "--left-right", "--count", "HEAD...@{u}"],
            git_root
        )
        if ahead_behind_out:
            parts = ahead_behind_out.split()
            if len(parts) == 2:
                result["ahead"] = int(parts[0])
                result["behind"] = int(parts[1])
            else:
                result["ahead"] = 0
                result["behind"] = 0
        else:
            result["ahead"] = 0
            result["behind"] = 0

        result["repo_root"] = git_root
        logger.info(f"Git info fetched for project '{project.get('name')}' on branch '{result['branch']}'")
        return result

    def git_checkout_branch(self, project_id, repo_path, branch_name):
        """Checkout a local branch for the given repository."""
        projects = self._load_from_json()
        project = next((p for p in projects if p.get("id") == project_id), None)
        if not project:
            return {"success": False, "message": "Project not found"}

        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err

        stdout, stderr, rc = self._run_git(["checkout", branch_name], git_root)
        if rc == 0:
            logger.info(f"Checked out branch '{branch_name}' for project '{project.get('name')}'")
            return {"success": True, "message": f"Switched to branch '{branch_name}'"}
        else:
            logger.error(f"Failed to checkout branch '{branch_name}': {stderr}")
            return {"success": False, "message": stderr or "Failed to checkout branch"}

    def _validate_git_root(self, project_id, repo_path):
        """Helper: resolve and validate the git root for a given path. Returns (git_root, error_dict|None)."""
        if not repo_path or not os.path.isdir(repo_path):
            return None, {"success": False, "message": "Invalid repository path"}
        _, _, rc = self._run_git(["rev-parse", "--is-inside-work-tree"], repo_path)
        if rc != 0:
            return None, {"success": False, "message": "Not a git repository"}
        root_out, _, _ = self._run_git(["rev-parse", "--show-toplevel"], repo_path)
        return root_out if root_out else repo_path, None

    def git_stage_all(self, project_id, repo_path):
        """Stage all changes (git add -A)."""
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        _, stderr, rc = self._run_git(["add", "-A"], git_root)
        if rc == 0:
            logger.info(f"Staged all changes for project '{project_id}'")
            return {"success": True, "message": "All changes staged"}
        return {"success": False, "message": stderr or "git add -A failed"}

    def git_stage_file(self, project_id, repo_path, filepath):
        """Stage a single file (git add <file>)."""
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        _, stderr, rc = self._run_git(["add", filepath], git_root)
        if rc == 0:
            logger.info(f"Staged file '{filepath}' for project '{project_id}'")
            return {"success": True, "message": f"Staged: {filepath}"}
        return {"success": False, "message": stderr or "git add failed"}

    def git_unstage_file(self, project_id, repo_path, filepath):
        """Unstage a single file (git restore --staged <file>)."""
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        _, stderr, rc = self._run_git(["restore", "--staged", filepath], git_root)
        if rc == 0:
            logger.info(f"Unstaged file '{filepath}' for project '{project_id}'")
            return {"success": True, "message": f"Unstaged: {filepath}"}
        return {"success": False, "message": stderr or "git restore --staged failed"}

    def git_unstage_all(self, project_id, repo_path):
        """Unstage all staged changes (git restore --staged .)."""
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        _, stderr, rc = self._run_git(["restore", "--staged", "."], git_root)
        if rc == 0:
            logger.info(f"Unstaged all changes for project '{project_id}'")
            return {"success": True, "message": "All changes unstaged"}
        return {"success": False, "message": stderr or "git restore --staged failed"}

    def git_commit(self, project_id, repo_path, message):
        """Commit staged changes with the given message."""
        if not message or not message.strip():
            return {"success": False, "message": "Commit message cannot be empty"}
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        stdout, stderr, rc = self._run_git(["commit", "-m", message.strip()], git_root)
        if rc == 0:
            logger.info(f"Committed for project '{project_id}': {message.strip()[:60]}")
            return {"success": True, "message": stdout or "Commit successful"}
        
        err_msg = stderr if stderr else (stdout if stdout else "git commit failed")
        if "nothing to commit" in err_msg:
            return {"success": False, "message": "Nothing to commit, working tree clean"}
            
        return {"success": False, "message": err_msg}

    def git_push(self, project_id, repo_path, remote="origin", branch=""):
        """Push commits to remote. Defaults to origin and the current branch."""
        git_root, err = self._validate_git_root(project_id, repo_path)
        if err:
            return err
        # If no branch given, use current branch
        if not branch:
            branch_out, _, _ = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"], git_root)
            branch = branch_out.strip() if branch_out else "main"
        args = ["push", remote, branch]
        stdout, stderr, rc = self._run_git(args, git_root)
        if rc == 0:
            logger.info(f"Pushed '{branch}' to '{remote}' for project '{project_id}'")
            # git push often writes success output to stderr
            success_msg = stdout if stdout else (stderr if stderr else f"Pushed to {remote}/{branch}")
            return {"success": True, "message": success_msg}
            
        err_msg = stderr if stderr else (stdout if stdout else "git push failed")
        return {"success": False, "message": err_msg}

