import os
import signal
import subprocess
import threading
import time
import json
import psutil

from backend.logger import logger
from backend.mixins.port_mixin import PortMixin

class ProcessManager(PortMixin):
    def __init__(self, get_projects_callback, api=None):
        self.lock = threading.RLock()
        self.processes = {}
        self.active_ports = {}
        self.allocated_ports = {}
        self.logs = {}
        self.intentionally_stopped = set()
        self.installing_deps = set()
        self.last_statuses = {}
        self.window = None
        self.get_projects = get_projects_callback
        self.api = api
        self.docker_services_running = set()
        self.docker_containers = {}
        
        self.metrics = {}
        self._metrics_thread = threading.Thread(target=self._metrics_loop, daemon=True)
        self._metrics_thread.start()

    def _trigger_crash_notification(self, key):
        logger.info(f"Triggering crash notification for key: {key}")
        if key in self.intentionally_stopped:
            logger.info(f"Skipping notification for {key} because it was intentionally stopped.")
            return
            
        if key in self.installing_deps:
            logger.info(f"Skipping notification for {key} because it just finished installing dependencies.")
            self.installing_deps.discard(key)
            return
            
        proj_name = "Embedded Terminal"
        serv_name = key
        
        if not key.startswith("terminal_"):
            parts = key.split('_', 1)
            if len(parts) == 2:
                p_id, s_id = parts
                projects = self.get_projects()
                proj = next((p for p in projects if p.get('id') == p_id), None)
                if proj:
                    proj_name = proj.get('name', 'Unknown Project')
                    serv = next((s for s in proj.get('services', []) if s.get('id') == s_id), None)
                    if serv:
                        serv_name = serv.get('name', 'Unknown Service')
                        cmd_lower = serv.get('command', '').lower()
                        # If the command contains detached flags, do not show a crash notification
                        # because the terminal process is expected to exit immediately.
                        if ('-d ' in cmd_lower or ' -d' in cmd_lower or '--detach' in cmd_lower or '-s ' in cmd_lower or ' -s' in cmd_lower):
                            logger.info(f"Skipping notification for {key} because it uses a background/detached flag.")
                            return
                else:
                    proj_name = "Servo Dashboard"
                    serv_name = "Unknown Service"
                    
        try:
            if self.api and hasattr(self.api, 'show_toast_window'):
                logger.info(f"Calling show_toast_window for {proj_name} / {serv_name}")
                self.api.show_toast_window(f"⚠️ Servo: {proj_name}", f"Service '{serv_name}' stopped running.")
            else:
                logger.warning("self.api is not set or lacks show_toast_window!")
        except Exception as e:
            logger.error(f"Failed to send custom toast notification: {e}")

    def _metrics_loop(self):
        process_cache = {}
        while True:
            time.sleep(1.0)
            with self.lock:
                keys = list(self.processes.keys())
            
            new_metrics = {}
            active_pids = set()
            
            for key in keys:
                with self.lock:
                    proc = self.processes.get(key)
                
                if not proc:
                    continue
                    
                pid = proc.pid
                try:
                    if pid not in process_cache:
                        process_cache[pid] = psutil.Process(pid)
                    
                    p = process_cache[pid]
                    active_pids.add(pid)
                    mem = p.memory_info().rss
                    cpu = p.cpu_percent(interval=None)
                    
                    listening_ports = []
                    try:
                        for c in p.connections(kind='inet'):
                            if c.status == psutil.CONN_LISTEN:
                                listening_ports.append(c.laddr.port)
                    except (psutil.AccessDenied, psutil.ZombieProcess):
                        pass

                    for child in p.children(recursive=True):
                        c_pid = child.pid
                        if c_pid not in process_cache:
                            process_cache[c_pid] = child
                        active_pids.add(c_pid)
                        if child.name().lower() != 'conhost.exe':
                            try:
                                mem += process_cache[c_pid].memory_info().rss
                                cpu += process_cache[c_pid].cpu_percent(interval=None)
                                for c in process_cache[c_pid].connections(kind='inet'):
                                    if c.status == psutil.CONN_LISTEN:
                                        listening_ports.append(c.laddr.port)
                            except (psutil.AccessDenied, psutil.ZombieProcess):
                                pass
                    
                    # psutil returns CPU per-core (e.g., 200% for 2 cores). Divide by logical cores to scale to 100%
                    total_cores = psutil.cpu_count() or 1
                    normalized_cpu = cpu / total_cores

                    new_metrics[key] = {
                        "cpu": round(normalized_cpu, 1),
                        "memory": round(mem / (1024 * 1024), 1)
                    }
                    
                    if listening_ports:
                        with self.lock:
                            # Only overwrite if there wasn't a hardcoded active_port from start_service,
                            # or just always prefer the real listening port
                            self.active_ports[key] = listening_ports[0]
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
                except Exception as e:
                    pass
            
            # cleanup cache for dead pids
            for p in list(process_cache.keys()):
                if p not in active_pids:
                    del process_cache[p]
                    
            with self.lock:
                self.metrics = new_metrics

            # Background check for Docker containers
            new_docker_running = set()
            new_docker_containers = {}
            try:
                import docker
                client = docker.from_env()
                containers = client.containers.list(all=True)
                
                projects = self.get_projects()
                for p in projects:
                    p_id = p.get('id')
                    for s in p.get('services', []):
                        s_id = s.get('id')
                        key = f"{p_id}_{s_id}"
                        
                        language = s.get('language', '')
                        if language in ("Docker", "Docker Compose") or "docker" in s.get('command', '').lower():
                            is_compose = language == "Docker Compose" or "docker-compose" in s.get('command', '').lower() or "docker compose" in s.get('command', '').lower()
                            if is_compose:
                                svc_path = s.get('path', '')
                                if svc_path and not os.path.isabs(svc_path):
                                    svc_path = os.path.normpath(os.path.join(p.get('path', ''), svc_path))
                                else:
                                    svc_path = svc_path or p.get('path', '')
                                expanded_path = os.path.expandvars(os.path.expanduser(svc_path))
                                expanded_path = os.path.normcase(os.path.abspath(expanded_path))
                                for c in containers:
                                    working_dir = c.labels.get('com.docker.compose.project.working_dir')
                                    if working_dir and os.path.normcase(os.path.abspath(working_dir)) == expanded_path:
                                        if c.status == 'running':
                                            new_docker_running.add(key)
                                        if key not in new_docker_containers:
                                            new_docker_containers[key] = []
                                        new_docker_containers[key].append({"name": c.name, "state": c.status})
                                
                                # Debug log for empty cases
                                if key not in new_docker_containers:
                                    logger.info(f"Docker Compose path '{expanded_path}' didn't match any containers.")
                                else:
                                    logger.info(f"Docker Compose path '{expanded_path}' MATCHED {len(new_docker_containers[key])} containers.")
                            else:
                                target_port = self.allocated_ports.get(key)
                                if target_port:
                                    try:
                                        tp = str(target_port)
                                        for c in containers:
                                            ports = c.attrs.get('NetworkSettings', {}).get('Ports', {})
                                            if any(port_key.startswith(tp + '/') or any(mapping and mapping.get('HostPort') == tp for mapping in mappings or []) for port_key, mappings in ports.items()):
                                                if c.status == 'running':
                                                    new_docker_running.add(key)
                                                if key not in new_docker_containers:
                                                    new_docker_containers[key] = []
                                                new_docker_containers[key].append({"name": c.name, "state": c.status})
                                    except Exception as e:
                                        logger.error(f"Error in Docker port logic: {e}")
            except Exception as e:
                err_str = str(e)
                if "The system cannot find the file specified" in err_str or "Error while fetching server API version" in err_str:
                    pass # Docker Desktop is not running, normal state
                else:
                    logger.debug(f"Error in Docker metrics loop: {e}")

            with self.lock:
                self.docker_services_running = new_docker_running
                self.docker_containers = new_docker_containers

            # Track status changes for interactive terminal crash notifications
            current_statuses = self.get_statuses()
            for k, status in current_statuses.items():
                if k in self.last_statuses:
                    if self.last_statuses[k] != status:
                        logger.info(f"Service '{k}' status changed from '{self.last_statuses[k]}' to '{status}'")
                    if self.last_statuses[k] == 'Running' and status in ('Idle', 'Error'):
                        self._trigger_crash_notification(k)
                self.last_statuses[k] = status

    def install_dependencies(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            projects = self.get_projects()
            project = next((p for p in projects if p.get('id') == project_id), None)
            if not project:
                return False
            service = next((s for s in project.get('services', []) if s.get('id') == service_id), None)
            if not service:
                return False
            
            language = service.get('language', '')
            svc_path = service.get('path', '')
            if svc_path and not os.path.isabs(svc_path):
                svc_path = os.path.normpath(os.path.join(project.get('path', ''), svc_path))
            svc_path = os.path.expanduser(svc_path)
            if language == 'Node.js':
                if os.path.exists(os.path.join(svc_path, 'yarn.lock')):
                    cmd = "yarn install"
                elif os.path.exists(os.path.join(svc_path, 'pnpm-lock.yaml')):
                    cmd = "pnpm install"
                else:
                    cmd = "npm install"
            elif language == 'Python':
                if os.path.exists(os.path.join(svc_path, 'requirements.txt')):
                    cmd = "python -m pip install -r requirements.txt"
                elif os.path.exists(os.path.join(svc_path, 'pyproject.toml')) or os.path.exists(os.path.join(svc_path, 'setup.py')):
                    cmd = "python -m pip install ."
                elif os.path.exists(os.path.join(svc_path, 'Pipfile')):
                    cmd = "pipenv install"
                else:
                    cmd = "echo [Servo] No requirements.txt, pyproject.toml, or Pipfile found."
            elif language == 'Rust':
                cmd = "cargo build"
            elif language == 'Go':
                cmd = "go mod tidy"
            else:
                return False
                
            # If the process is currently running a server (busy), we should probably not interrupt it,
            # but start_service handles the busy check and ignores start if busy.
            
            self.installing_deps.add(key)
            
            # Start the service with the install command
            
            # Start the service with the install command
            return self.start_service(project_id, service_id, override_command=cmd)

    def write_to_service(self, project_id, service_id, data):
        key = f"{project_id}_{service_id}"
        if project_id == "terminal":
            key = f"terminal_{service_id}"
        with self.lock:
            proc = self.processes.get(key)
            if hasattr(proc, 'write'):
                try:
                    proc.write(data)
                    
                    if data == '\x03':
                        # The user pressed Ctrl+C. Try to aggressively kill any running child commands
                        # inside the winpty terminal (like npm run dev) so they don't get stuck.
                        try:
                            agent_proc = psutil.Process(proc.pid)
                            for shell_proc in agent_proc.children():
                                for cmd_proc in shell_proc.children():
                                    import subprocess as sp
                                    kwargs = {"shell": True, "capture_output": True}
                                    if os.name == 'nt':
                                        kwargs["creationflags"] = sp.CREATE_NO_WINDOW
                                    sp.run(f"taskkill /F /T /PID {cmd_proc.pid}", **kwargs)
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

    def resize_terminal(self, project_id, service_id, cols, rows):
        key = f"{project_id}_{service_id}"
        if project_id == "terminal":
            key = f"terminal_{service_id}"
        with self.lock:
            proc = self.processes.get(key)
            if hasattr(proc, 'set_size'):
                try:
                    proc.set_size(cols, rows)
                    return True
                except Exception as e:
                    logger.error(f"Failed to resize terminal {key}: {e}")
        return False

    def _read_stream_winpty(self, key, pty):
        try:
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
                    if self.window:
                        try:
                            self.window.evaluate_js(f"if (window.writeToTerminalUI) window.writeToTerminalUI('{key}', \"{escaped}\");")
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
                    if key in self.active_ports:
                        del self.active_ports[key]
                    if key in self.logs:
                        self.logs[key].append("[SYSTEM] Console session closed.")
                
                if key in self.intentionally_stopped:
                    self.intentionally_stopped.discard(key)

    def _read_stream(self, key, stream, stream_name):
        try:
            while True:
                # Read chunks to support interactive prompt rendering without blocking
                chunk = stream.read(1024)
                if not chunk:
                    break
                text = chunk.decode('utf-8', errors='replace')
                text = text.replace('\r\n', '\n').replace('\n', '\r\n')
                
                with self.lock:
                    if key not in self.logs:
                        self.logs[key] = []
                    self.logs[key].append(text)
                    if len(self.logs[key]) > 2000:
                        self.logs[key] = self.logs[key][-2000:]
                        
                escaped = json.dumps(text)[1:-1] # escape safely for JS
                if self.window:
                    try:
                        self.window.evaluate_js(f"if (window.writeToTerminalUI) window.writeToTerminalUI('{key}', \"{escaped}\");")
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
                        if key in self.active_ports:
                            del self.active_ports[key]
                        if key in self.logs:
                            self.logs[key].append("[SYSTEM] Process stream closed.")
                
                if key in self.intentionally_stopped:
                    self.intentionally_stopped.discard(key)

    def warmup_service_terminal(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        with self.lock:
            if key in self.processes:
                return True
                
            projects = self.get_projects()
            project = next((p for p in projects if p.get('id') == project_id), None)
            if not project:
                return False
                
            service = next((s for s in project.get('services', []) if s.get('id') == service_id), None)
            if not service:
                return False
                
            path = service.get('path')
            if not path:
                return False
                
            expanded_path = os.path.expanduser(path)
            process_env = os.environ.copy()
            
            venv_path = service.get('venv_path')
            use_venv = service.get('use_venv', True)
            if venv_path and use_venv:
                expanded_venv = os.path.expanduser(venv_path)
                venv_bin = os.path.join(expanded_venv, 'Scripts') if os.name == 'nt' else os.path.join(expanded_venv, 'bin')
                process_env['PATH'] = venv_bin + os.pathsep + process_env.get('PATH', '')
                process_env['VIRTUAL_ENV'] = expanded_venv
                
            if os.name == 'nt':
                try:
                    import winpty
                    pty = winpty.PTY(80, 24)
                    pty_env = '\0'.join([f"{k}={v}" for k, v in process_env.items()]) + '\0'
                    pty.spawn('powershell.exe', cwd=expanded_path, env=pty_env)
                    self.processes[key] = pty
                    self.logs[key] = [f"[SYSTEM] PowerShell terminal ready in {expanded_path}\r\n"]
                    t_out = threading.Thread(target=self._read_stream_winpty, args=(key, pty), daemon=True)
                    t_out.start()
                    return True
                except ImportError:
                    pass
                    
            return False

    def start_service(self, project_id, service_id, override_command=None):
        key = f"{project_id}_{service_id}"
        with self.lock:
            projects = self.get_projects()
            project = next((p for p in projects if p.get('id') == project_id), None)
            if not project:
                logger.warning(f"Start failed: project ID {project_id} does not exist.")
                return False
                
            service = next((s for s in project.get('services', []) if s.get('id') == service_id), None)
            if not service:
                logger.warning(f"Start failed: service ID {service_id} does not exist in project {project_id}.")
                return False
                
            path = service.get('path', '')
            command = override_command if override_command else service.get('command', '')
            use_venv = service.get('use_venv', False)
            venv_path = service.get('venv_path', '')
            
            # Pre-process command string replacement
            self._ensure_project_ports_allocated(project_id)
            actual_port = self.allocated_ports.get(key)
            if actual_port:
                command = command.replace("{port}", str(actual_port)).replace("{PORT}", str(actual_port))

            if not command.strip():
                logger.info(f"Start ignored: service {key} has no command.")
                return False

            if path and not os.path.isabs(path):
                proj_path = project.get('path', '')
                path = os.path.normpath(os.path.join(proj_path, path))
                
            name = f"{project.get('name')} - {service.get('name')}"
            
            if not path or not command:
                logger.warning(f"Start failed for service {key}: Missing path or command parameters.")
                return False

            # Check if service is already running
            if key in self.processes:
                proc = self.processes[key]
                is_busy = False
                if os.name == 'nt':
                    try:
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
                
                # Dynamic Port Allocation
                self._ensure_project_ports_allocated(project_id)
                
                actual_port = self.allocated_ports.get(key)
                if actual_port:
                    process_env['PORT'] = str(actual_port)
                    command = command.replace("{port}", str(actual_port)).replace("{PORT}", str(actual_port))
                    self.active_ports[key] = actual_port
                    logger.info(f"Dynamically assigned port {actual_port} for service '{name}'")

                if venv_path and use_venv:
                    expanded_venv = os.path.expanduser(venv_path)
                    venv_bin = os.path.join(expanded_venv, 'Scripts') if os.name == 'nt' else os.path.join(expanded_venv, 'bin')
                    
                    if os.name == 'nt':
                        activate_script = os.path.join(venv_bin, 'Activate.ps1')
                        if os.path.exists(activate_script):
                            command = f'& "{activate_script}"; {command}'
                    else:
                        activate_script = os.path.join(venv_bin, 'activate')
                        if os.path.exists(activate_script):
                            command = f'source "{activate_script}" && {command}'
                    
                    logger.info(f"Prepending virtual environment activation script for service '{name}'")
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
                        pty_env = '\0'.join([f"{k}={v}" for k, v in process_env.items()]) + '\0\0'
                        
                        # Spawn the process in the PTY without any arguments
                        pty.spawn('powershell.exe', cwd=expanded_path, env=pty_env)
                        
                        self.processes[key] = pty
                        self.logs[key] = [f"[SYSTEM] Service started in winpty embedded console\r\n"]
                        logger.info(f"Service '{name}' successfully started with winpty.")
                        
                        # Clear frontend terminal for the new process
                        if self.window:
                            try:
                                self.window.evaluate_js(f"if (window.__terminals && window.__terminals['{key}']) window.__terminals['{key}'].reset();")
                            except Exception:
                                pass
                        
                        # Start background thread to drain PTY
                        t_out = threading.Thread(target=self._read_stream_winpty, args=(key, pty), daemon=True)
                        t_out.start()
                        
                        # Automatically 'type' the command into the shell so the user sees it at the prompt
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
                    if key in self.intentionally_stopped:
                        self.intentionally_stopped.discard(key)
                    self.logs[key] = [f"[SYSTEM] Service started in embedded console with PID {proc.pid}\r\n"]
                    logger.info(f"Service '{name}' successfully started. Process PID: {proc.pid}")
                    
                    # Clear frontend terminal for the new process
                    if self.window:
                        try:
                            self.window.evaluate_js(f"if (window.__terminals && window.__terminals['{key}']) window.__terminals['{key}'].reset();")
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

    def start_raw_terminal(self, terminal_id, cwd=None):
        key = f"terminal_{terminal_id}"
        with self.lock:
            if key in self.processes:
                return True
            
            logger.info(f"Attempting to launch raw terminal (Key: {key}). CWD: '{cwd}'")
            try:
                expanded_path = os.path.expanduser(cwd) if cwd else os.path.expanduser("~")
                
                if os.name == 'nt':
                    try:
                        import winpty
                        pty = winpty.PTY(80, 24)
                        pty.spawn('powershell.exe', cwd=expanded_path)
                        
                        self.processes[key] = pty
                        self.logs[key] = [f"[SYSTEM] Embedded terminal started in winpty\r\n"]
                        
                        if self.window:
                            try:
                                self.window.evaluate_js(f"if (window.__terminals && window.__terminals['{key}']) window.__terminals['{key}'].reset();")
                            except Exception:
                                pass
                        
                        t_out = threading.Thread(target=self._read_stream_winpty, args=(key, pty), daemon=True)
                        t_out.start()
                    except ImportError:
                        logger.warning("pywinpty not installed for raw terminal.")
                        return False
                else:
                    # Basic fallback for Unix (not using pty for simplicity here, winpty handles windows)
                    proc = subprocess.Popen(
                        '/bin/bash',
                        shell=True,
                        cwd=expanded_path,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        stdin=subprocess.PIPE,
                        bufsize=0
                    )
                    self.processes[key] = proc
                    self.logs[key] = [f"[SYSTEM] Terminal started with PID {proc.pid}\r\n"]
                    if hasattr(proc, 'stdout') and proc.stdout:
                        t_out = threading.Thread(target=self._read_stream, args=(key, proc.stdout, "STDOUT"), daemon=True)
                        t_out.start()
                        
                return True
            except Exception as e:
                self.logs[key] = [f"[SYSTEM] Failed to start terminal: {str(e)}"]
                logger.error(f"Exception spawning terminal {key}: {e}", exc_info=True)
                return False

    def stop_service(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        if project_id == "terminal":
            key = f"terminal_{service_id}"
        with self.lock:
            proc = self.processes.get(key)
            if not proc:
                logger.debug(f"Stop ignored: service {key} is not running.")
                return False
                
            logger.info(f"Attempting to stop process tree for service key: {key} (PID: {proc.pid})")
            try:
                # If the process is an interactive PTY, send Ctrl+C instead of killing the shell
                if hasattr(proc, 'write'):
                    self.intentionally_stopped.add(key)
                    self.write_to_service(project_id, service_id, '\x03')
                    if key in self.logs:
                        self.logs[key].append("[SYSTEM] Sent Ctrl+C to terminal. Terminal remains interactive.\r\n")
                    logger.info(f"Sent Ctrl+C to interactive terminal for service key: {key}")
                    return True

                self.intentionally_stopped.add(key)
                if os.name == 'nt':
                    import subprocess as sp
                    kwargs = {"shell": True, "capture_output": True}
                    if os.name == 'nt':
                        kwargs["creationflags"] = sp.CREATE_NO_WINDOW
                    sp.run(f"taskkill /F /T /PID {proc.pid}", **kwargs)
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
                    if key in self.active_ports:
                        del self.active_ports[key]
                logger.info(f"Successfully stopped process tree for service key: {key}")
                return True
            except Exception as e:
                logger.error(f"Exception stopping service {key}: {e}", exc_info=True)
                return False

    def get_statuses(self):
        with self.lock:
            statuses = {}
            projects = self.get_projects()
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
                                
                        if poll is None or key in self.docker_services_running:
                            statuses[key] = "Running"
                        else:
                            statuses[key] = "Error" if poll != 0 else "Idle"
                            # If it stopped, clean up its port from active_ports
                            if key in self.active_ports:
                                del self.active_ports[key]
                    else:
                        # Process hasn't been started in this session
                        if key in self.docker_services_running:
                            statuses[key] = "Running"
                        else:
                            statuses[key] = "Idle"
                        
            return statuses

    def check_port_conflict(self, port):
        """Finds any process listening on the given port and returns its info without killing it."""
        try:
            port = int(port)
        except ValueError:
            return {"success": False, "message": "Invalid port number."}

        conflicting_processes = []
        try:
            for p in psutil.process_iter(['pid', 'name']):
                try:
                    for c in p.connections(kind='inet'):
                        if c.status == psutil.CONN_LISTEN and c.laddr.port == port:
                            conflicting_processes.append({"pid": p.pid, "name": p.info['name']})
                            break
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    continue
        except Exception as e:
            return {"success": False, "message": f"Error inspecting processes: {str(e)}"}

        if not conflicting_processes:
            return {"success": True, "conflict": False}
        
        return {
            "success": True, 
            "conflict": True,
            "processes": conflicting_processes
        }

    def resolve_port_conflict(self, port):
        """Finds any process listening on the given port and kills it."""
        try:
            port = int(port)
        except ValueError:
            return {"success": False, "message": "Invalid port number."}

        killed_processes = []
        try:
            for p in psutil.process_iter(['pid', 'name']):
                try:
                    for c in p.connections(kind='inet'):
                        if c.status == psutil.CONN_LISTEN and c.laddr.port == port:
                            p.kill()
                            killed_processes.append({"pid": p.pid, "name": p.info['name']})
                            break
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    continue
        except Exception as e:
            return {"success": False, "message": f"Error inspecting processes: {str(e)}"}

        if not killed_processes:
            return {"success": True, "message": f"No processes found listening on port {port}."}
        
        return {
            "success": True, 
            "message": f"Killed {len(killed_processes)} process(es) on port {port}.",
            "killed": killed_processes
        }

    def get_dependency_statuses(self):
        deps_status = {}
        projects = self.get_projects()
        for p in projects:
            p_id = p.get('id')
            for s in p.get('services', []):
                s_id = s.get('id')
                key = f"{p_id}_{s_id}"
                
                language = s.get('language', '')
                svc_path = s.get('path', '')
                if svc_path and not os.path.isabs(svc_path):
                    svc_path = os.path.normpath(os.path.join(p.get('path', ''), svc_path))
                svc_path = os.path.expanduser(svc_path)
                
                has_deps = None
                if language == 'Node.js':
                    pkg_json = os.path.join(svc_path, 'package.json')
                    if os.path.exists(pkg_json):
                        has_deps = pkg_json
                elif language == 'Python':
                    reqs = os.path.join(svc_path, 'requirements.txt')
                    pyproj = os.path.join(svc_path, 'pyproject.toml')
                    setup = os.path.join(svc_path, 'setup.py')
                    pipfile = os.path.join(svc_path, 'Pipfile')
                    
                    if os.path.exists(reqs):
                        has_deps = reqs
                    elif os.path.exists(pyproj):
                        has_deps = pyproj
                    elif os.path.exists(setup):
                        has_deps = setup
                    elif os.path.exists(pipfile):
                        has_deps = pipfile
                elif language == 'Rust':
                    cargo = os.path.join(svc_path, 'Cargo.toml')
                    if os.path.exists(cargo):
                        has_deps = cargo
                elif language == 'Go':
                    gomod = os.path.join(svc_path, 'go.mod')
                    if os.path.exists(gomod):
                        has_deps = gomod
                
                deps_status[key] = has_deps
        return deps_status

    def get_metrics(self):
        with self.lock:
            return self.metrics.copy()

    def get_active_ports(self):
        with self.lock:
            return self.active_ports.copy()

    def get_logs(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        if project_id == "terminal":
            key = f"terminal_{service_id}"
        with self.lock:
            return self.logs.get(key, [])

    def clear_logs(self, project_id, service_id):
        key = f"{project_id}_{service_id}"
        if project_id == "terminal":
            key = f"terminal_{service_id}"
            
        with self.lock:
            if key in self.logs:
                self.logs[key] = []
            logger.info(f"Cleared virtual console logs buffer for {key}")
            return True

    def cleanup_logs_for_project(self, project_id):
        prefix = f"{project_id}_"
        with self.lock:
            for key in list(self.logs.keys()):
                if key.startswith(prefix):
                    del self.logs[key]
