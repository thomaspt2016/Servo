import os
import sys
import urllib.request
import platform
import stat
import subprocess
from backend.logger import logger
from backend.config import CADDY_VERSION, CADDY_DOWNLOAD_URL, PROXY_HOST

def download_caddy():
    """Downloads the correct Caddy binary for the current OS if it doesn't exist."""
    
    # Determine OS and Architecture
    system = platform.system().lower()
    arch = platform.machine().lower()
    
    # Map Python's arch to Go's arch naming
    if arch in ['x86_64', 'amd64']:
        go_arch = 'amd64'
    elif arch in ['arm64', 'aarch64']:
        go_arch = 'arm64'
    else:
        logger.error(f"Unsupported architecture: {arch}")
        return None

    # Map Python's OS to Go's OS naming and executable extension
    if system == 'windows':
        go_os = 'windows'
        ext = '.zip'
        exe_name = 'caddy.exe'
    elif system == 'darwin':
        go_os = 'mac'
        ext = '.tar.gz'
        exe_name = 'caddy'
    else:
        go_os = 'linux'
        ext = '.tar.gz'
        exe_name = 'caddy'

    # Setup the download paths (using the Servo application directory)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bin_dir = os.path.join(base_dir, 'bin')
    os.makedirs(bin_dir, exist_ok=True)
    caddy_path = os.path.join(bin_dir, exe_name)

    # If it already exists, we are good to go!
    if os.path.exists(caddy_path):
        return caddy_path

    # Define the GitHub release URL (Using Caddy 2.7.6 as a stable version)
    version = CADDY_VERSION
    filename = f"caddy_{version}_{go_os}_{go_arch}{ext}"
    url = CADDY_DOWNLOAD_URL.format(version=version, filename=filename)
    
    download_path = os.path.join(bin_dir, filename)

    try:
        logger.info(f"Downloading Caddy reverse proxy from {url}...")
        urllib.request.urlretrieve(url, download_path)
        
        # Extract the binary
        if ext == '.zip':
            import zipfile
            with zipfile.ZipFile(download_path, 'r') as zip_ref:
                zip_ref.extract(exe_name, bin_dir)
        else:
            import tarfile
            with tarfile.open(download_path, 'r:gz') as tar_ref:
                # Security note: tar.gz extraction can be unsafe if not from a trusted source, 
                # but we are downloading directly from the official GitHub release.
                tar_ref.extract(exe_name, bin_dir)
                
        # Make it executable (for Mac/Linux)
        if system != 'windows':
            st = os.stat(caddy_path)
            os.chmod(caddy_path, st.st_mode | stat.S_IEXEC)
            
        # Clean up the downloaded archive
        os.remove(download_path)
        logger.info(f"Caddy successfully installed to {caddy_path}")
        
        return caddy_path
        
    except Exception as e:
        logger.error(f"Failed to download Caddy: {e}")
        return None

def start_reverse_proxy(project_name, proxy_port, backend_port, frontend_port):
    """
    Dynamically generates a Caddyfile for a project and starts the proxy server.
    """
    caddy_exe = download_caddy()
    
    if not caddy_exe:
        logger.error(f"[{project_name}] Cannot start proxy: Caddy binary is missing.")
        return None
        
    # Create project-specific configuration directory inside the app folder
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_dir = os.path.join(base_dir, 'projects', project_name)
    os.makedirs(config_dir, exist_ok=True)
    
    # Dynamically create the Caddyfile
    # We prefix with http:// to explicitly disable Caddy's automatic HTTPS. 
    # This prevents Caddy from trying to install a local root certificate which triggers a UAC prompt.
    caddyfile_content = f"""
    http://{PROXY_HOST}:{proxy_port} {{
        handle_path /api/* {{
            reverse_proxy {PROXY_HOST}:{backend_port}
        }}
        handle {{
            reverse_proxy {PROXY_HOST}:{frontend_port}
        }}
    }}
    """
    
    caddyfile_path = os.path.join(config_dir, 'Caddyfile')
    with open(caddyfile_path, 'w') as f:
        f.write(caddyfile_content)
        
    logger.info(f"[{project_name}] Starting Caddy reverse proxy on port {proxy_port} (Backend: {backend_port}, Frontend: {frontend_port})")
    
    # Start Caddy as a background subprocess
    # Using 'run' instead of 'start' so it runs attached to this process's lifecycle 
    # (or we can use start if we want it detached, but run allows us to terminate it easier when the window closes)
    proxy_process = subprocess.Popen(
        [caddy_exe, 'run', '--config', caddyfile_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )
    
    return proxy_process
