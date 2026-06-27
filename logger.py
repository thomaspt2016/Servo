import os
import sys
import logging
from logging.handlers import RotatingFileHandler

class AccessibilityLogFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
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

log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'servo.log')
file_handler = RotatingFileHandler(log_file_path, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8')
stream_handler = logging.StreamHandler(sys.stdout)

log_filter = AccessibilityLogFilter()
file_handler.addFilter(log_filter)
stream_handler.addFilter(log_filter)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) - %(message)s',
    handlers=[file_handler, stream_handler]
)
logger = logging.getLogger("servo")
