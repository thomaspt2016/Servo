import os
import sys
import threading
import webview

from backend.logger import logger
from backend.api import Api
from backend.config import (
    DEBUG, DEV_URL, WINDOW_TITLE, WINDOW_WIDTH, WINDOW_HEIGHT, 
    WINDOW_BG_COLOR, PIP_TITLE, PIP_WIDTH, PIP_HEIGHT, 
    PIP_MIN_SIZE, PIP_BG_COLOR
)

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
        url = DEV_URL
        logger.info(f"Running in development mode (hot-reloading {DEV_URL})")
    else:
        html_path = os.path.join(api.base_dir, 'gui', 'dist', 'index.html')
        if not os.path.exists(html_path):
            logger.warning(f"Production assets not found at {html_path}! Falling back to dev url")
            url = DEV_URL
        else:
            url = f'file:///{html_path.replace(chr(92), "/")}'
            logger.info(f"Loading compiled client assets from: {url}")
            
    window = webview.create_window(
        WINDOW_TITLE,
        url,
        js_api=api,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        background_color=WINDOW_BG_COLOR
    )
    api._window = window

    # Pre-create PiP window here on the main GUI thread to avoid deadlock 
    # when pywebview tries to create it dynamically from an API thread.
    pip_url = url + '#pip' if DEBUG else url + '#pip'
    pip_window = webview.create_window(
        PIP_TITLE,
        pip_url,
        js_api=api,
        width=PIP_WIDTH,
        height=PIP_HEIGHT,
        min_size=PIP_MIN_SIZE,
        frameless=True,
        easy_drag=False,
        on_top=True,
        background_color=PIP_BG_COLOR,
        shadow=True,
        hidden=True
    )
    api._pip_window = pip_window

    # Stop all running child processes when the window closes to prevent orphan hangs
    def on_closed():
        logger.info("Window closed. Stopping all running project subprocesses...")
        for key in list(api._process_manager.processes.keys()):
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
        # Force Edge Chromium on Windows, otherwise use system default (Cocoa on Mac, GTK on Linux)
        gui_type = 'edgechromium' if os.name == 'nt' else None
        webview.start(gui=gui_type, debug=DEBUG)
    except Exception as e:
        logger.error(f"webview.start encountered an error: {e}", exc_info=True)
        sys.exit(1)
