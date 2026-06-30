import os
from backend.logger import logger

class WindowMixin:
    def open_pip(self):
        """Open the PiP floating overlay window (starts hidden; shown when main loses focus)."""
        if self._pip_window is not None:
            logger.info("Opening PiP overlay window...")
            try:
                self._pip_window.show()
                # Start focus monitor if it hasn't been started yet
                if not getattr(self, '_pip_monitor_started', False) and os.name == 'nt':
                    self._pip_monitor_started = True
                    import threading
                    threading.Thread(target=self._pip_focus_monitor, daemon=True).start()
                return True
            except Exception as e:
                logger.error(f"Failed to show PiP window: {e}", exc_info=True)
                return False
        return False

    def close_pip(self):
        """Close the PiP overlay window."""
        if self._pip_window is not None:
            logger.info("Closing PiP overlay window...")
            try:
                self._pip_window.hide()
            except Exception as e:
                logger.error(f"Error hiding PiP window: {e}")
            return True
        return False

    def report_focus(self, is_focused):
        """Called by frontend to report whether the main window's webview has focus."""
        self.is_main_focused = is_focused

    def show_toast_window(self, title, message):
        """Spawns a highly reliable native Windows notification."""
        try:
            logger.info(f"Triggering native Windows notification: '{title}'")
            
            def _send_toast():
                try:
                    from win11toast import toast
                    toast(title, message, app_id="Servo Dashboard")
                    logger.info("Native toast sent successfully.")
                except Exception as e:
                    logger.error(f"win11toast failed: {e}")

            import threading
            threading.Thread(target=_send_toast, daemon=True).start()
            
        except Exception as e:
            logger.error(f"Failed to initiate native toast: {e}", exc_info=True)

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

                pip_is_active    = (fg == pip_hwnd)
                main_is_minimized = bool(user32.IsIconic(main_hwnd))
                pip_is_visible   = bool(user32.IsWindowVisible(pip_hwnd))

                # Use frontend-reported focus or HWND match for reliability with WebView2
                main_is_active = getattr(self, 'is_main_focused', True) or (fg == main_hwnd)

                statuses = self.get_statuses()
                any_running = "Running" in statuses.values()

                if not any_running or (main_is_active and not main_is_minimized):
                    # No services running OR Main window is in the foreground hide PiP
                    if pip_is_visible:
                        try:
                            pip_win.hide()
                        except Exception as e:
                            logger.error(f"Error hiding PiP: {e}")
                        logger.info("PiP hidden main window active or no services running.")
                    if main_is_active and not main_is_minimized:
                        self._pip_paused = False  # reset so PiP reappears next time
                elif (main_is_minimized or not main_is_active) and not pip_is_active:
                    # Main is minimized OR user switched to another app AND services are running show PiP
                    if not pip_is_visible and not self._pip_paused:
                        try:
                            pip_win.show()
                            if hasattr(pip_win, 'native') and pip_win.native:
                                pip_win.native.TopMost = True
                                
                            # Restore focus to whatever app the user was using
                            import ctypes
                            if fg and fg != pip_win.native.Handle.ToInt32():
                                ctypes.windll.user32.SetForegroundWindow(fg)
                        except Exception as e:
                            logger.error(f"Error showing PiP: {e}")
                        logger.info("PiP shown main window inactive/minimized and services running.")
            except Exception as e:
                logger.error(f"PiP monitor error: {e}", exc_info=True)

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
