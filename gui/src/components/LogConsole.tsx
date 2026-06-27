import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

window.writeToTerminalUI = (key: string, data: string) => {
  if (window.__terminals && window.__terminals[key]) {
    window.__terminals[key].write(data);
  }
};

interface LogConsoleProps {
  projectId: string;
  serviceId: string;
  serviceName: string;
  logs: string[];
  status: string;
  onClear?: () => void;
  onKill?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function LogConsole({ projectId, serviceId, serviceName, logs, status, onClear, onKill, isCollapsed = false, onToggleCollapse }: LogConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const term = new XTerm({
      theme: { background: 'transparent' },
      fontFamily: 'monospace',
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true, 
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(containerRef.current);
    fitAddon.fit();
    
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {}
    });
    resizeObserver.observe(containerRef.current);
    
    termRef.current = term;

    const key = `${projectId}_${serviceId}`;
    if (!window.__terminals) window.__terminals = {};
    window.__terminals[key] = term;

    if (logs && logs.length > 0) {
      term.write(logs.join(''));
    }

    term.onData(data => {
      if (window.pywebview?.api?.write_to_service) {
        window.pywebview.api.write_to_service(projectId, serviceId, data);
      }
    });

    return () => {
      resizeObserver.disconnect();
      if (window.__terminals) {
        delete window.__terminals[key];
      }
      term.dispose();
    };
  }, [projectId, serviceId]);

  return (
    <div className={`flex flex-col overflow-hidden border border-zinc-900 bg-zinc-955/45 rounded-xl shadow-md glass transition-all ${isCollapsed ? 'h-10 min-h-[40px]' : 'flex-1 min-w-[300px] min-h-[220px] max-h-[80vh] resize-y'} `} style={{ height: isCollapsed ? '40px' : '360px' }}>
      {/* Console Header */}
      <div 
        className="h-10 border-b border-zinc-900 px-4 flex items-center justify-between text-[11px] bg-zinc-950/80 cursor-pointer select-none"
        onClick={() => onToggleCollapse && onToggleCollapse()}
      >
        <div className="flex items-center space-x-2 text-zinc-400">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold text-zinc-200">
            Console: {serviceName}
          </span>
          <Badge
            variant={
              status === "Running"
                ? "success"
                : status === "Error"
                ? "destructive"
                : "outline"
            }
            className="scale-90 select-none py-0 px-1.5"
          >
            {status}
          </Badge>
        </div>
          <div className="flex items-center space-x-2">
            {onToggleCollapse && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors text-[10px] mr-2"
              >
                {isCollapsed ? "Expand" : "Collapse"}
              </button>
            )}
            {onKill && (
              <button
                onClick={(e) => { e.stopPropagation(); onKill(); }}
                className="text-destructive/80 hover:text-destructive transition-colors text-[10px] mr-2"
              >
                Kill Process
              </button>
            )}
            {onClear && (
              <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="text-zinc-555 hover:text-zinc-300 transition-colors text-[10px]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

      {/* Console Output Logs */}
      {!isCollapsed && (
        <div 
          ref={containerRef}
          className="flex-1 overflow-hidden p-2 pb-4 bg-black/45 [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent"
        />
      )}
    </div>
  );
}
