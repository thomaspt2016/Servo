import { useState, useEffect } from "react";
import { Layers, ExternalLink, X } from "lucide-react";
import type { Project, Service } from "../types";

export function PipView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(false);

  const getApi = () => window.pywebview!.api;

  const fetchData = async () => {
    try {
      const data = await getApi().get_pip_data();
      setProjects(data.projects);
      setStatuses(data.statuses);
    } catch (e) {
      console.error("PiP fetch error:", e);
    }
  };

  useEffect(() => {
    const check = () => {
      if (window.pywebview?.api) { setIsReady(true); return true; }
      return false;
    };
    if (check()) return;
    const t = setTimeout(() => check(), 600);
    const h = () => { setIsReady(true); clearTimeout(t); };
    window.addEventListener("pywebviewready", h);
    return () => { window.removeEventListener("pywebviewready", h); clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    fetchData();
    // Force window resize in case the backend wasn't restarted
    getApi().resize_pip(280, 48).catch(() => {});
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [isReady]);

  // Native drag handled entirely by pywebview-drag-region class

  const allServices: { project: Project; service: Service }[] = [];
  projects.forEach(p => (p.services || []).forEach(s => allServices.push({ project: p, service: s })));

  const runningCount = allServices.filter(({ project: p, service: s }) => statuses[`${p.id}_${s.id}`] === "Running").length;
  const totalCount = allServices.length;

  const handleClose = async () => {
    // Hides the PiP for this session (toggle in main app is the only true on/off)
    try { await getApi().minimize_pip(); } catch (e) { console.error(e); }
  };
  const handleFocusMain = async () => {
    try { await getApi().focus_main_window(); } catch (e) { console.error(e); }
  };

  return (
    <div
      className="flex flex-row items-center justify-between h-screen w-screen text-zinc-100 font-sans select-none overflow-hidden px-6"
      style={{
        background: "linear-gradient(160deg, #0f0f12 0%, #09090b 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "14px",
      }}
    >
      {/* Drag handle */}
      <div className="pywebview-drag-region flex-1 h-full flex items-center cursor-grab active:cursor-grabbing pl-4">
        <Layers className="h-4 w-4 text-primary opacity-80" />
      </div>
      
      {/* Actions */}
      <div className="flex flex-row gap-4 items-center pr-4">
        <div className={`h-2.5 w-2.5 rounded-full mr-1 ${runningCount > 0 ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" : "bg-zinc-700"}`} title={`${runningCount}/${totalCount} running`} />
        
        <button onClick={handleFocusMain} title="Open Servo" className="h-8 w-8 rounded-full flex items-center justify-center bg-zinc-800/80 hover:bg-primary/20 hover:text-primary text-zinc-300 transition-colors">
          <ExternalLink className="h-4 w-4" />
        </button>
        <button onClick={handleClose} title="Hide PiP" className="h-8 w-8 rounded-full flex items-center justify-center bg-zinc-800/80 hover:bg-destructive/20 hover:text-destructive text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
