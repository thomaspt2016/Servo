# Hotkeys & Picture-in-Picture (PiP) Mode

A developer dashboard shouldn't get in your way. Servo is designed to live quietly in the background and only appear exactly when you need it. To achieve this, Servo utilizes a global hotkey system and an unobtrusive Picture-in-Picture overlay mode.

---

## Global Hotkey Toggling

You don't need to go searching for Servo in your taskbar or alt-tabbing through dozens of windows. Servo registers a global OS-level hotkey that works from any application.

**The Hotkey:** `Ctrl + Alt + S` *(Windows Only)*

### How it works:
- **Summoning**: If you are typing in your IDE and want to check if your backend server has restarted, simply press `Ctrl + Alt + S`. The Servo dashboard will instantly snap to the foreground, taking focus.
- **Dismissing**: Once you've checked your logs or started a new project, press `Ctrl + Alt + S` again. The window will immediately hide to the system tray, returning focus to your previous application.
- **System Tray**: When hidden, Servo remains running. You can find its icon in the Windows System Tray (bottom right of your taskbar). Right-clicking this icon provides options to manually show the dashboard or quit the application entirely.

*Note: The global hotkey is currently implemented via the `keyboard` Python library and requires proper permissions on Windows. Mac/Linux support is planned for a future release.*

---

## Picture-in-Picture (PiP) Mode

Sometimes you need to keep a constant eye on a running process—perhaps you are waiting for a long build step to finish or monitoring a flaky test suite—but you can't afford to sacrifice screen real estate for the full Servo dashboard.

This is where **PiP Mode** comes in.

### Activating PiP Mode
In the top right corner of the main Servo dashboard, you will find a **PiP button** (often represented by a minimal square icon). Clicking this button will transform the application:

1. **Shrinks the Window**: The large dashboard disappears, replaced by a tiny, sleek overlay widget.
2. **Snaps to Corner**: The widget automatically anchors itself to the bottom right corner of your primary monitor (just above the system tray).
3. **Always On Top**: The PiP widget is configured to float above all other windows. Even if you maximize your IDE or browser, the Servo widget remains visible.

### What PiP Mode Displays
The PiP widget is designed to be glanceable. It strips away the logs and configuration UI, displaying only:
- A compact list of your currently running projects.
- **Status Indicators**: A pulsing green dot for healthy running projects, and a red dot for processes that have crashed or stopped unexpectedly.
- A quick-stop button to kill a project directly from the overlay.

### Returning to Full Dashboard
To exit PiP mode and restore the full interface to view logs or edit configurations, simply double-click anywhere on the PiP widget, or click the "Expand" icon located within the widget itself. The widget will seamlessly transition back into the standard central window.
