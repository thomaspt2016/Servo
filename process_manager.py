import os
import signal
import subprocess
import threading
import time
import json
import psutil

from logger import logger

class ProcessManager:
    def __init__(self, get_projects_callback):
        self.lock = threading.Lock()
        self.processes = {}
        self.logs = {}
        self.window = None
        self.get_projects = get_projects_callback

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
                    if key in self.logs:
                        self.logs[key].append("[SYSTEM] Console session closed.")

    def _read_stream(self, key, stream, stream_name):
        try:
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
                        if key in self.logs:
                            self.logs[key].append("[SYSTEM] Process stream closed.")

    def start_service(self, project_id, service_id):
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
                        pty_env = '\0'.join([f"{k}={v}" for k, v in process_env.items()]) + '\0'
                        
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

    def cleanup_logs_for_project(self, project_id):
        prefix = f"{project_id}_"
        with self.lock:
            for key in list(self.logs.keys()):
                if key.startswith(prefix):
                    del self.logs[key]
