# Advanced Log Viewer

The terminal is great, but sifting through interleaved logs from multiple services is a nightmare. Servo solves this by providing isolated, real-time log viewers for every project on your dashboard.

## Real-Time Streaming Architecture

When you start a project, you don't have to wait for the command to finish to see the output. 

Servo uses **multi-threaded daemon workers** on the Python backend. These threads constantly poll the standard output (`stdout`) and standard error (`stderr`) pipes of your running processes. When new text is emitted, the backend bridges it to the React frontend instantly. 

Because these daemon threads run asynchronously, the main Servo application remains perfectly responsive, even if a project is rapidly spamming thousands of lines of logs.

## Navigating the Log UI

To view a project's logs, simply select the project from the sidebar or click its log icon on the dashboard.

### Auto-Scroll (Tail Mode)
By default, the log viewer is configured to **auto-scroll** to the bottom. As new log lines arrive, the view snaps down so you are always looking at the most recent events.

- **Pausing Auto-Scroll**: If you need to read a specific error message while the project is still running and emitting logs, simply scroll up using your mouse wheel or trackpad. Servo will automatically detect that you have scrolled away from the bottom and will **pause auto-scrolling**. 
- **Resuming Auto-Scroll**: A "Scroll to Bottom" button will appear. Clicking it will snap you back to the latest logs and re-enable auto-scrolling.

### Log Formatting
Servo preserves the whitespace and formatting of your logs. If your terminal command outputs colored text using ANSI escape codes, future versions of Servo's log viewer will parse these codes to render colored badges and text directly in the UI.

---

## Best Practices for Project Logging

To get the most out of the Servo log viewer:
1. **Disable Output Buffering**: Many languages buffer output when they detect they are not running in an interactive TTY terminal. 
   - *Python*: Run with the `-u` flag (`python -u main.py`) or set the `PYTHONUNBUFFERED=1` environment variable to ensure logs stream instantly.
   - *Node.js*: Node generally flushes `console.log` immediately, but ensure you aren't using buffering loggers.
2. **Log to Stderr for Errors**: Ensure your applications are correctly writing warnings and errors to `stderr` rather than `stdout`. This allows Servo to properly categorize and potentially highlight these lines in the future.
