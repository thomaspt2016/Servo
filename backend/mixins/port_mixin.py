class PortMixin:
    def _get_free_port(self):
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            return s.getsockname()[1]

    def _ensure_project_ports_allocated(self, project_id):
        projects = self.get_projects()
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return
            
        for s in project.get('services', []):
            s_id = s.get('id')
            key = f"{project_id}_{s_id}"
            
            # Only allocate a port if the command contains {port} or {PORT}
            command = s.get('command', '')
            if '{port}' in command.lower() and key not in self.allocated_ports:
                self.allocated_ports[key] = self._get_free_port()

    def start_project_proxy(self, project_id, project):
        from backend.caddy_manager import start_reverse_proxy
        frontend_port = None
        backend_port = None
        
        for s in project.get('services', []):
            key = f"{project_id}_{s.get('id')}"
            actual_port = self.allocated_ports.get(key)
            if actual_port:
                stype = s.get('serviceType', '').lower()
                name = s.get('name', '').lower()
                
                if stype == 'web frontend' or stype == 'frontend' or 'frontend' in name or 'client' in name or 'web' in name:
                    frontend_port = actual_port
                elif stype == 'api backend' or stype == 'backend' or 'backend' in name or 'server' in name or 'api' in name:
                    backend_port = actual_port
                    
        # If we have both, we need a proxy to bridge them
        if frontend_port and backend_port:
            proxy_key = f"{project_id}_proxy"
            if proxy_key not in self.allocated_ports:
                self.allocated_ports[proxy_key] = self._get_free_port()
            
            proxy_port = self.allocated_ports[proxy_key]
            
            # Check if already running
            if proxy_key in self.processes:
                if self.processes[proxy_key].poll() is None:
                    return # Already running
            
            proc = start_reverse_proxy(project.get('name'), proxy_port, backend_port, frontend_port)
            if proc:
                with self.lock:
                    self.processes[proxy_key] = proc
                    self.active_ports[proxy_key] = proxy_port
                    self.logs[proxy_key] = [f"[SYSTEM] Proxy started on port {proxy_port}"]
