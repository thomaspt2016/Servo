import os

# Environment/Debug Configuration
DEBUG = os.environ.get("SERVO_DEBUG", "False").lower() in ("true", "1", "yes")

# Window Constants
WINDOW_TITLE = 'Servo'
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 850
WINDOW_BG_COLOR = '#09090b'

# PiP Window Constants
PIP_TITLE = 'Servo PiP'
PIP_WIDTH = 280
PIP_HEIGHT = 48
PIP_MIN_SIZE = (100, 30)
PIP_BG_COLOR = '#09090b'

# Network & URLs
DEV_URL = 'http://localhost:5173'
PROXY_HOST = 'localhost'

# Caddy Configuration
CADDY_VERSION = '2.7.6'
CADDY_DOWNLOAD_URL = 'https://github.com/caddyserver/caddy/releases/download/v{version}/{filename}'

# Storage
STORAGE_FILE = 'storage.json'
