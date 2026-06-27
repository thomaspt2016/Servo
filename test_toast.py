import webview
import time
import threading
import screeninfo
import urllib.parse
import os

def run_test():
    title = "Test Notification"
    message = "This should appear perfectly in the bottom right corner!"
    
    # Resolve the local GUI path
    base_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(base_dir, 'gui', 'dist', 'index.html')
    pip_url = f'file:///{html_path.replace(chr(92), "/")}'
    
    # Append the toast mode query
    full_url = f'{pip_url}#toast?title={urllib.parse.quote(title)}&message={urllib.parse.quote(message)}'

    print(f"Loading URL: {full_url}")

    toast_win = webview.create_window(
        'Servo Toast Test',
        full_url,
        width=340,
        height=90,
        frameless=True,
        on_top=True,
        transparent=True,
        background_color='#000000',
        shadow=False
    )

    def _init_toast():
        # Wait slightly for pywebview to initialize the root window handle internally
        time.sleep(1.0) 
        
        try:
            print("Calculating bottom-right coordinates using screeninfo...")
            monitors = screeninfo.get_monitors()
            m = next((m for m in monitors if m.is_primary), monitors[0])
            
            x = m.x + m.width - 340 - 20
            y = m.y + m.height - 90 - 60
            
            print(f"Primary Display detected: {m.width}x{m.height}")
            print(f"Moving window to absolute coordinates: ({int(x)}, {int(y)})")
            
            # Using pywebview's native cross-platform move API
            toast_win.move(int(x), int(y))
        except Exception as e:
            print(f"Failed to position window: {e}")
            
        # Destroy window after 5 seconds
        time.sleep(5)
        print("Test complete, destroying window.")
        toast_win.destroy()

    # Start positioning logic in background
    threading.Thread(target=_init_toast, daemon=True).start()

    # Start the native OS GUI loop (Blocking)
    print("Starting GUI loop...")
    webview.start()

if __name__ == '__main__':
    run_test()
