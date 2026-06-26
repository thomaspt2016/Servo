import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  Terminal,
  Trash2,
  Edit2,
  Play,
  Square,
  Search,
  Plus,
  RefreshCw,
  X,
  Info,
  FolderOpen,
  FileCode,
  Copy,
  PictureInPicture2,
  ExternalLink
} from "lucide-react";

// Import custom UI components
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// API Interface declaration
declare global {
  interface Window {
    pywebview?: {
      api: {
        load_projects(): Promise<Project[]>;
        save_project(project: Project): Promise<boolean>;
        delete_project(id: string): Promise<boolean>;
        start_service(projectId: string, serviceId: string): Promise<boolean>;
        stop_service(projectId: string, serviceId: string): Promise<boolean>;
        start_project(projectId: string): Promise<boolean>;
        stop_project(projectId: string): Promise<boolean>;
        get_statuses(): Promise<Record<string, string>>;
        get_logs(projectId: string, serviceId: string): Promise<string[]>;
        clear_logs(projectId: string, serviceId: string): Promise<boolean>;
        pick_folder(default_dir?: string | null): Promise<string | null>;
        pick_file(default_dir?: string | null): Promise<string | null>;
        get_npm_scripts(folder_path: string): Promise<string[]>;
        get_installed_languages(): Promise<string[]>;
        open_pip(): Promise<boolean>;
        close_pip(): Promise<boolean>;
        minimize_pip(): Promise<boolean>;
        resize_pip(width: number, height: number): Promise<boolean>;
        focus_main_window(): Promise<boolean>;
        get_pip_data(): Promise<{ projects: Project[]; statuses: Record<string, string> }>;
        write_to_service(projectId: string, serviceId: string, data: string): Promise<boolean>;
      };
    };
  }
}

interface Service {
  id: string;
  name: string;
  path: string;
  command: string;
  venv_path?: string;
  use_venv?: boolean;
  language?: string;
  description?: string;
}

interface Project {
  id: string;
  name: string;
  category: string;
  description?: string;
  services: Service[];
}



const getApi = () => {
  return window.pywebview!.api;
};

import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

declare global {
  interface Window {
    writeToTerminalUI?: (key: string, data: string) => void;
    __terminals?: Record<string, any>;
  }
}

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
  onClear: () => void;
}

function LogConsole({ projectId, serviceId, serviceName, logs, status, onClear }: LogConsoleProps) {
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
    <div className="flex-1 min-w-[300px] min-h-[220px] max-h-[80vh] resize-y flex flex-col overflow-hidden border border-zinc-900 bg-zinc-955/45 rounded-xl shadow-md glass" style={{ height: '360px' }}>
      {/* Console Header */}
      <div className="h-10 border-b border-zinc-900 px-4 flex items-center justify-between text-[11px] bg-zinc-950/80">
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
        <button
          onClick={onClear}
          className="text-zinc-555 hover:text-zinc-300 transition-colors text-[10px]"
        >
          Clear
        </button>
      </div>

      {/* Console Output Logs */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden p-2 pb-4 bg-black/45 [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent"
      />
    </div>
  );
}

// ── PiP Overlay View ─────────────────────────────────────────────────────────
function PipView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  // Native drag via -webkit-app-region handled in CSS; mouse events for fallback
  const onDragStart = (e: React.MouseEvent) => {
    setDragging(true);
    dragOffset.current = { x: e.clientX, y: e.clientY };
  };
  useEffect(() => {
    const onMove = (_e: MouseEvent) => {
      if (!dragging) return;
      // pywebview frameless windows are draggable natively; this is a visual cue only
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

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
      <div onMouseDown={onDragStart} className="flex-1 h-full flex items-center cursor-grab active:cursor-grabbing pl-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <Layers className="h-4 w-4 text-primary opacity-80" />
      </div>
      
      {/* Actions */}
      <div className="flex flex-row gap-4 items-center pr-4" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
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

// Computed once at module load — never changes during the lifetime of this window
// Uses hash (#pip) because query params (?mode=pip) don't work on file:// URLs
const IS_PIP_MODE = window.location.hash === "#pip";

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [installedLanguages, setInstalledLanguages] = useState<string[]>(["Python", "Other"]);
  const [pipEnabled, setPipEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem("servo-pip-enabled");
    return stored === null ? true : stored === "true";
  });
  // Terminal / Logs Panel State
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectLogs, setProjectLogs] = useState<Record<string, string[]>>({});
  const [autoScroll, setAutoScroll] = useState(true);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [npmScripts, setNpmScripts] = useState<Record<string, string[]>>({});

  const fetchNpmScripts = async (serviceId: string, folderPath: string) => {
    if (!folderPath) {
      setNpmScripts(prev => ({ ...prev, [serviceId]: [] }));
      return;
    }
    try {
      const scripts = await getApi().get_npm_scripts(folderPath);
      setNpmScripts(prev => ({ ...prev, [serviceId]: scripts }));
    } catch (err) {
      console.error("Error fetching npm scripts:", err);
      setNpmScripts(prev => ({ ...prev, [serviceId]: [] }));
    }
  };

  const fetchInstalledLanguages = async () => {
    try {
      const langs = await getApi().get_installed_languages();
      setInstalledLanguages(langs);
    } catch (err) {
      console.error("Error fetching installed languages:", err);
    }
  };

  const handleTogglePip = async () => {
    try {
      if (pipEnabled) {
        await getApi().close_pip();
        setPipEnabled(false);
        localStorage.setItem("servo-pip-enabled", "false");
      } else {
        await getApi().open_pip();
        setPipEnabled(true);
        localStorage.setItem("servo-pip-enabled", "true");
      }
    } catch (err) {
      console.error("Error toggling PiP:", err);
    }
  };

  const [formState, setFormState] = useState<{
    id: string;
    name: string;
    description: string;
    category: string;
    services: {
      id: string;
      name: string;
      description: string;
      path: string;
      command: string;
      venv_path: string;
      use_venv: boolean;
      language?: string;
      mode?: "file" | "npm" | "custom";
    }[];
  }>({
    id: "",
    name: "",
    description: "",
    category: "Python",
    services: []
  });



  // Verification of pywebview injection
  useEffect(() => {
    const checkWebview = () => {
      if (window.pywebview && window.pywebview.api) {
        setIsDesktop(true);
        setIsChecking(false);
        return true;
      }
      return false;
    };

    if (checkWebview()) return;

    const timer = setTimeout(() => {
      if (!checkWebview()) {
        setIsChecking(false);
      }
    }, 500);

    const handleReady = () => {
      setIsDesktop(true);
      setIsChecking(false);
      clearTimeout(timer);
    };

    window.addEventListener("pywebviewready", handleReady);
    return () => {
      window.removeEventListener("pywebviewready", handleReady);
      clearTimeout(timer);
    };
  }, []);


  // Initial Load once desktop bridge is validated
  useEffect(() => {
    if (!isDesktop) return;

    fetchProjects();
    fetchStatuses();
    fetchInstalledLanguages();
    // Restore PiP feature state from previous session (window stays hidden until needed)
    if (pipEnabled) {
      getApi().open_pip().catch(() => {});
    }
    const interval = setInterval(fetchStatuses, 1000);
    return () => clearInterval(interval);
  }, [isDesktop]);

  // Poll active logs for all services in the selected project
  useEffect(() => {
    if (!isDesktop || !activeProjectId) {
      setProjectLogs({});
      return;
    }

    const activeProj = projects.find(p => p.id === activeProjectId);
    if (!activeProj || !activeProj.services || activeProj.services.length === 0) {
      setProjectLogs({});
      return;
    }

    const fetchAllLogs = async () => {
      try {
        const logsPromises = activeProj.services.map(async (s) => {
          const logs = await getApi().get_logs(activeProjectId, s.id);
          return { serviceId: s.id, logs };
        });
        const results = await Promise.all(logsPromises);
        const newLogs: Record<string, string[]> = {};
        results.forEach(res => {
          newLogs[res.serviceId] = res.logs;
        });
        setProjectLogs(newLogs);
      } catch (err) {
        console.error("Error reading project logs:", err);
      }
    };

    fetchAllLogs();
    const interval = setInterval(fetchAllLogs, 1000);
    return () => clearInterval(interval);
  }, [isDesktop, activeProjectId, projects]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await getApi().load_projects();
      setProjects(data);
    } catch (err) {
      console.error("Error loading projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatuses = async () => {
    try {
      const data = await getApi().get_statuses();
      setStatuses(data);
    } catch (err) {
      console.error("Error fetching statuses:", err);
    }
  };

  // Service controls
  const handleStartService = async (projectId: string, serviceId: string) => {
    try {
      const success = await getApi().start_service(projectId, serviceId);
      if (success) {
        fetchStatuses();
        setActiveProjectId(projectId);
      }
    } catch (err) {
      console.error("Failed to start service:", err);
    }
  };

  const handleStopService = async (projectId: string, serviceId: string) => {
    try {
      const success = await getApi().stop_service(projectId, serviceId);
      if (success) {
        fetchStatuses();
      }
    } catch (err) {
      console.error("Failed to stop service:", err);
    }
  };

  // Project controls (all services)
  const handleStartProject = async (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const success = await getApi().start_project(projectId);
      if (success) {
        fetchStatuses();
        const proj = projects.find(p => p.id === projectId);
        if (proj && proj.services.length > 0) {
          setActiveProjectId(projectId);
        }
      }
    } catch (err) {
      console.error("Failed to start project:", err);
    }
  };

  const handleStopProject = async (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const success = await getApi().stop_project(projectId);
      if (success) {
        fetchStatuses();
      }
    } catch (err) {
      console.error("Failed to stop project:", err);
    }
  };

  // Save Project Form Submit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogError("");

    if (!formState.name.trim()) return setDialogError("Project Name is required");
    if (formState.services.length === 0) return setDialogError("At least one service is required");

    for (let i = 0; i < formState.services.length; i++) {
      const s = formState.services[i];
      if (!s.name.trim()) return setDialogError(`Service #${i + 1} Name is required`);
      if (!s.path.trim()) return setDialogError(`Service #${i + 1} Folder Path is required`);
      if (!s.command.trim()) return setDialogError(`Service #${i + 1} Command is required`);
    }

    const projectToSave: Project = {
      id: isEditMode ? formState.id : `proj-${Date.now()}`,
      name: formState.name.trim(),
      description: formState.description.trim() || undefined,
      category: formState.services[0]?.language || "Other",
      services: formState.services.map(s => ({
        id: s.id,
        name: s.name.trim(),
        description: s.description.trim() || undefined,
        path: s.path.trim(),
        command: s.command.trim(),
        venv_path: s.venv_path.trim() || undefined,
        use_venv: s.use_venv,
        language: s.language || "Python"
      }))
    };

    try {
      const success = await getApi().save_project(projectToSave);
      if (success) {
        setIsDialogOpen(false);
        fetchProjects();
        fetchStatuses();
      } else {
        setDialogError("Failed to save project config.");
      }
    } catch (err) {
      setDialogError("API error occurred while saving.");
      console.error(err);
    }
  };

  // Edit Project Click
  const handleEditClick = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setNpmScripts({});
    project.services.forEach((s) => {
      if (s.language === "Node.js" && s.path) {
        fetchNpmScripts(s.id, s.path);
      }
    });

    setFormState({
      id: project.id,
      name: project.name,
      description: project.description || "",
      category: project.category,
      services: project.services.map(s => {
        let mode: "file" | "npm" | "custom" = "custom";
        if (s.language === "Node.js") {
          if (s.command.startsWith("npm run ") || s.command === "npm start" || !s.command.trim()) {
            mode = "npm";
          }
        } else {
          if (!s.command.trim()) {
            mode = "file";
          } else {
            const lowerCmd = s.command.trim().toLowerCase();
            const startsWithRunner = 
              lowerCmd.startsWith("python ") || 
              lowerCmd.startsWith("node ") || 
              lowerCmd.startsWith("ts-node ") || 
              lowerCmd.startsWith("./") ||
              lowerCmd.startsWith("bash ") ||
              lowerCmd.startsWith("go run ");
            const endsWithExt = /\.[a-z0-9]+["']?$/i.test(lowerCmd);
            if (startsWithRunner || endsWithExt) {
              mode = "file";
            }
          }
        }

        return {
          id: s.id,
          name: s.name,
          description: s.description || "",
          path: s.path,
          command: s.command,
          venv_path: s.venv_path || "",
          use_venv: s.use_venv !== false,
          language: s.language || "Python",
          mode
        };
      })
    });
    setIsEditMode(true);
    setDialogError("");
    setIsDialogOpen(true);
  };

  // Duplicate Project Click
  const handleDuplicateClick = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setNpmScripts({});
    
    const newServices = project.services.map((s, index) => {
      let mode: "file" | "npm" | "custom" = "custom";
      if (s.language === "Node.js") {
        if (s.command.startsWith("npm run ") || s.command === "npm start" || !s.command.trim()) {
          mode = "npm";
        }
      } else {
        if (!s.command.trim()) {
          mode = "file";
        } else {
          const lowerCmd = s.command.trim().toLowerCase();
          const startsWithRunner = 
            lowerCmd.startsWith("python ") || 
            lowerCmd.startsWith("node ") || 
            lowerCmd.startsWith("ts-node ") || 
            lowerCmd.startsWith("./") ||
            lowerCmd.startsWith("bash ") ||
            lowerCmd.startsWith("go run ");
          const endsWithExt = /\.[a-z0-9]+["']?$/i.test(lowerCmd);
          if (startsWithRunner || endsWithExt) {
            mode = "file";
          }
        }
      }

      const newId = `srv-${Date.now()}-${index}`;
      if (s.language === "Node.js" && s.path) {
        fetchNpmScripts(newId, s.path);
      }

      return {
        id: newId,
        name: s.name,
        description: s.description || "",
        path: s.path,
        command: s.command,
        venv_path: s.venv_path || "",
        use_venv: s.use_venv !== false,
        language: s.language || "Python",
        mode
      };
    });

    setFormState({
      id: "", // Empty ID triggers new project configuration on save
      name: `${project.name} (Copy)`,
      description: project.description || "",
      category: project.category,
      services: newServices
    });
    setIsEditMode(false); // Duplicate is creating a new project based on an old one
    setDialogError("");
    setIsDialogOpen(true);
  };

  // Delete Project Click
  const handleDeleteClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project? All running services in it will be stopped.")) {
      try {
        const success = await getApi().delete_project(id);
        if (success) {
          if (activeProjectId === id) {
            setActiveProjectId(null);
          }
          fetchProjects();
          fetchStatuses();
        }
      } catch (err) {
        console.error("Failed to delete project:", err);
      }
    }
  };

  // Open Create Dialog
  const handleNewClick = () => {
    setNpmScripts({});
    setFormState({
      id: "",
      name: "",
      description: "",
      category: "Python",
      services: [
        { id: `srv-${Date.now()}-0`, name: "Main Server", description: "", path: "", command: "", venv_path: "", use_venv: true, language: "Python", mode: "file" }
      ]
    });
    setIsEditMode(false);
    setDialogError("");
    setIsDialogOpen(true);
  };

  // Clear project service logs
  const handleClearLogs = async (projectId: string, serviceId: string) => {
    try {
      await getApi().clear_logs(projectId, serviceId);
      setProjectLogs(prev => ({ ...prev, [serviceId]: ["[SYSTEM] Logs cleared."] }));
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  // Prepend virtual environment binary path to command
  const getVenvBinPrefix = (venvPath: string) => {
    const isWindows = navigator.userAgent.toLowerCase().includes("win") || venvPath.includes("\\");
    const separator = venvPath.includes("\\") ? "\\" : "/";
    const binFolder = isWindows ? "Scripts" : "bin";
    return `${venvPath}${venvPath.endsWith(separator) ? "" : separator}${binFolder}${separator}`;
  };

  // Get preview of how command will resolve when executed under venv PATH prepending
  const getResolvedCommandPreview = (service: { venv_path: string, command: string, use_venv?: boolean }, category: string) => {
    if (!service.venv_path.trim() || service.use_venv === false) {
      return service.command;
    }
    
    const venvBin = getVenvBinPrefix(service.venv_path.trim());
    const cmd = service.command.trim();
    const isWindows = navigator.userAgent.toLowerCase().includes("win") || service.venv_path.includes("\\");
    const exe = isWindows ? "python.exe" : "python";
    
    if (!cmd) {
      return `${venvBin}${exe}`;
    }
    
    const parts = cmd.split(' ');
    const firstWord = parts[0];
    const firstWordLower = firstWord.toLowerCase();
    
    // If the first word is already a known venv binary, prepend the path directly
    const knownBinaries = [
      "python", "python.exe", "python3", "python3.exe", 
      "pip", "pip3", "pytest", "uvicorn", "gunicorn", 
      "black", "pylint", "flake8", "mypy", "poetry", "pipenv"
    ];
    
    if (knownBinaries.includes(firstWordLower) || firstWordLower.endsWith(".exe")) {
      return `${venvBin}${cmd}`;
    }
    
    // If category is Python, assume running a script name -> prefix with python interpreter
    if (category === "Python") {
      return `${venvBin}${exe} ${cmd}`;
    }
    
    // Otherwise, default to prepending venv bin folder directly to command
    return `${venvBin}${cmd}`;
  };

  // Dialog Services list operations
  const handleAddServiceForm = () => {
    setFormState(prev => {
      const defaultLang = prev.category || "Python";
      const defaultMode = defaultLang === "Node.js" ? "npm" : "file";
      return {
        ...prev,
        services: [
          ...prev.services,
          {
            id: `srv-${Date.now()}-${prev.services.length}`,
            name: prev.services.length === 1 ? "Backend API" : `Service #${prev.services.length + 1}`,
            description: "",
            path: prev.services[0]?.path || "",
            command: "",
            venv_path: "",
            use_venv: true,
            language: defaultLang,
            mode: defaultMode
          }
        ]
      };
    });
  };

  const handleSetExecutionMode = (index: number, mode: "file" | "npm" | "custom") => {
    setFormState(prev => {
      const updated = [...prev.services];
      const svc = updated[index];
      let newCommand = svc.command;
      
      if (mode === "file") {
        const lowerCmd = svc.command.trim().toLowerCase();
        const startsWithRunner = 
          lowerCmd.startsWith("python ") || 
          lowerCmd.startsWith("node ") || 
          lowerCmd.startsWith("ts-node ") || 
          lowerCmd.startsWith("./") ||
          lowerCmd.startsWith("bash ") ||
          lowerCmd.startsWith("go run ");
        const endsWithExt = /\.[a-z0-9]+["']?$/i.test(lowerCmd);
        
        if (!startsWithRunner && !endsWithExt) {
          newCommand = "";
        }
      } else if (mode === "npm") {
        const scripts = npmScripts[svc.id] || [];
        if (scripts.length > 0) {
          newCommand = scripts[0] === "start" ? "npm start" : `npm run ${scripts[0]}`;
        } else {
          newCommand = "";
        }
      }
      
      updated[index] = {
        ...svc,
        mode,
        command: newCommand
      };
      return { ...prev, services: updated };
    });
  };

  const handleRemoveServiceForm = (index: number) => {
    setFormState(prev => ({
      ...prev,
      services: prev.services.filter((_, idx) => idx !== index)
    }));
  };

  const handleDuplicateServiceForm = (index: number) => {
    setFormState(prev => {
      const sourceSvc = prev.services[index];
      const duplicatedSvc = {
        ...sourceSvc,
        id: `srv-${Date.now()}-${prev.services.length}`,
        name: `${sourceSvc.name} (Copy)`
      };
      const updated = [...prev.services];
      updated.splice(index + 1, 0, duplicatedSvc);
      return {
        ...prev,
        services: updated
      };
    });
  };

  // Folder Pick Dialogs
  const handleBrowsePath = async (index: number) => {
    try {
      const currentPath = formState.services[index]?.path;
      const selectedPath = await getApi().pick_folder(currentPath || null);
      if (selectedPath) {
        setFormState(prev => {
          const updated = [...prev.services];
          updated[index] = { ...updated[index], path: selectedPath };
          return { ...prev, services: updated };
        });
        const svcId = formState.services[index]?.id;
        if (formState.services[index]?.language === "Node.js" && svcId) {
          fetchNpmScripts(svcId, selectedPath);
        }
      }
    } catch (err) {
      console.error("Error picking folder:", err);
    }
  };

  const handleBrowseVenv = async (index: number) => {
    try {
      const currentVenv = formState.services[index]?.venv_path || formState.services[index]?.path;
      const selectedPath = await getApi().pick_folder(currentVenv || null);
      if (selectedPath) {
        setFormState(prev => {
          const updated = [...prev.services];
          updated[index] = { ...updated[index], venv_path: selectedPath };
          return { ...prev, services: updated };
        });
      }
    } catch (err) {
      console.error("Error picking venv folder:", err);
    }
  };

  const handleBrowseCommandFile = async (index: number) => {
    try {
      const service = formState.services[index];
      const startDir = service.path || null;
      const selectedFile = await getApi().pick_file(startDir);
      if (selectedFile) {
        setFormState(prev => {
          const updated = [...prev.services];
          const svc = updated[index];
          
          // Normalize paths to use forward slashes
          const cleanFile = selectedFile.replace(/\\/g, '/');
          
          // Generate suggested command based on extension and category
          const lowerFile = cleanFile.toLowerCase();
          let suggestedCommand = cleanFile;
          
          if (lowerFile.endsWith('.py')) {
            suggestedCommand = `python "${cleanFile}"`;
          } else if (lowerFile.endsWith('.js') || lowerFile.endsWith('.mjs') || lowerFile.endsWith('.cjs')) {
            suggestedCommand = `node "${cleanFile}"`;
          } else if (lowerFile.endsWith('.ts')) {
            suggestedCommand = `ts-node "${cleanFile}"`;
          } else if (lowerFile.endsWith('.sh')) {
            suggestedCommand = `bash "${cleanFile}"`;
          } else if (lowerFile.endsWith('.bat') || lowerFile.endsWith('.cmd')) {
            suggestedCommand = `"${cleanFile}"`;
          } else if (lowerFile.endsWith('.ps1')) {
            suggestedCommand = `powershell -File "${cleanFile}"`;
          } else if (lowerFile.endsWith('package.json')) {
            suggestedCommand = `npm start`;
          } else if (lowerFile.endsWith('cargo.toml')) {
            suggestedCommand = `cargo run`;
          } else if (lowerFile.endsWith('go.mod') || lowerFile.endsWith('.go')) {
            suggestedCommand = lowerFile.endsWith('.go') ? `go run "${cleanFile}"` : `go run .`;
          }
          
          updated[index] = { ...svc, command: suggestedCommand };
          return { ...prev, services: updated };
        });
      }
    } catch (err) {
      console.error("Error picking command file:", err);
    }
  };



  // Filtering projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.services.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.command.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategory === "All" ||
      project.services.some(s => (s.language || "Python") === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", ...installedLanguages];

  // Metrics (Count services)
  let totalServicesCount = 0;
  let runningServicesCount = 0;
  let idleServicesCount = 0;
  let errorServicesCount = 0;

  projects.forEach(p => {
    p.services.forEach(s => {
      totalServicesCount++;
      const key = `${p.id}_${s.id}`;
      const status = statuses[key] || "Idle";
      if (status === "Running") runningServicesCount++;
      else if (status === "Error") errorServicesCount++;
      else idleServicesCount++;
    });
  });

  if (isChecking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm font-medium">Verifying desktop link...</span>
        </div>
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 font-sans">
        <div className="max-w-md w-full border border-zinc-900 bg-zinc-950 rounded-xl p-8 shadow-2xl glass text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 mx-auto mb-6">
            <Terminal className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Desktop Client Required</h2>
          <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
            Servo's process dashboard interacts directly with your local system. Run this application through the python desktop client to access terminal controls.
          </p>
          <div className="bg-black/60 border border-zinc-900 rounded-lg p-4 font-mono text-xs text-left text-zinc-400 mb-6 space-y-2 select-all">
            <div>
              <span className="text-zinc-600"># Install desktop window wrapper</span>
              <br />
              <span className="text-zinc-200">.\servo\Scripts\pip.exe install pywebview</span>
            </div>
            <div>
              <span className="text-zinc-600"># Start dashboard client</span>
              <br />
              <span className="text-zinc-200">.\servo\Scripts\python.exe app.py</span>
            </div>
          </div>
          <Button
            onClick={() => window.location.reload()}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
          >
            Reconnect Bridge
          </Button>
        </div>
      </div>
    );
  }

  const runningServices: { project: Project; service: Service }[] = [];
  projects.forEach(proj => {
    (proj.services || []).forEach(svc => {
      if (statuses[`${proj.id}_${svc.id}`] === "Running") {
        runningServices.push({ project: proj, service: svc });
      }
    });
  });


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground text-zinc-300">
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-zinc-900 bg-zinc-950/70 p-5 flex flex-col justify-between glass z-10">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 border border-primary/30 text-primary">
              <Layers className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-wider text-zinc-100 uppercase">Servo</h1>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block leading-tight">Process Manager</span>
            </div>
          </div>

          {/* Add Project Action */}
          <Button onClick={handleNewClick} className="w-full justify-start space-x-2 bg-primary/90 text-zinc-100 hover:bg-primary mb-4 shadow-lg shadow-primary/10">
            <Plus className="h-4 w-4" />
            <span>Add Project</span>
          </Button>

          {/* Navigation Categories */}
          <div className="mb-4">
            <span className="text-[10px] font-bold text-zinc-650 uppercase tracking-wider block mb-2 px-1">
              Category filter
            </span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-all border ${
                    selectedCategory === cat
                      ? "bg-primary/20 text-primary border-primary/40 font-medium"
                      : "bg-zinc-950/40 text-zinc-500 border-zinc-900 hover:text-zinc-300 hover:bg-zinc-900/40"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              placeholder="Search projects/services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-zinc-950/40 border-zinc-900 text-zinc-200 focus-visible:ring-primary/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Projects List */}
          <div className="flex-1 overflow-y-auto space-y-2 p-2 scrollbar-thin flex flex-col">
            <span className="text-[10px] font-bold text-zinc-650 uppercase tracking-wider block mb-1 px-1">
              Projects ({filteredProjects.length})
            </span>
            
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center space-y-2 py-8">
                <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                <span className="text-zinc-600 text-[10px]">Loading projects...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-zinc-650 text-xs italic text-center py-8">
                No projects configured.
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isActive = activeProjectId === project.id;
                const services = project.services || [];
                const runningCount = services.filter(s => statuses[`${project.id}_${s.id}`] === "Running").length;
                const errorCount = services.filter(s => statuses[`${project.id}_${s.id}`] === "Error").length;
                
                let statusColor = "bg-zinc-700";
                if (errorCount > 0) statusColor = "bg-destructive animate-pulse";
                else if (runningCount > 0) statusColor = "bg-emerald-500 animate-pulse";

                return (
                  <div
                    key={project.id}
                    onClick={() => {
                      setActiveProjectId(project.id);
                    }}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                      isActive
                        ? "bg-zinc-900/60 border-primary/45 shadow-sm text-zinc-200"
                        : "bg-zinc-950/30 border-zinc-900/80 hover:bg-zinc-900/30 hover:border-zinc-850 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate block flex-1">
                        {project.name}
                      </span>
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusColor}`} />
                    </div>
                    
                    <div className="flex items-center justify-between mt-1.5 text-[9px] text-zinc-550 font-medium">
                      <span className="truncate max-w-[65%]">
                        {Array.from(new Set(services.map(s => s.language || "Python"))).join(", ")}
                      </span>
                      <span>
                        {runningCount}/{services.length} Running
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950/20">
        {/* TOP NAVBAR */}
        <header className="h-16 border-b border-zinc-900 bg-zinc-950/50 px-8 flex items-center justify-between glass z-10">
          <div className="flex items-center space-x-3">
            <Layers className="h-5 w-5 text-primary/80" />
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              {activeProjectId ? "Project Workspace" : "Dashboard Overview"}
            </h2>
          </div>

          {/* Quick Metrics display */}
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-500">Services:</span>
              <span className="font-semibold text-zinc-200">{totalServicesCount}</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-500">Running:</span>
              <span className="font-semibold text-emerald-400">{runningServicesCount}</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-zinc-500" />
              <span className="text-zinc-500">Idle:</span>
              <span className="font-semibold text-zinc-400">{idleServicesCount}</span>
            </div>
            {errorServicesCount > 0 && (
              <>
                <div className="h-4 w-px bg-zinc-800" />
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-destructive animate-ping" />
                  <span className="text-zinc-500">Error:</span>
                  <span className="font-semibold text-destructive">{errorServicesCount}</span>
                </div>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleTogglePip}
              title={pipEnabled ? "PiP enabled — shows when app is minimised" : "PiP disabled — click to enable"}
              className={`h-8 w-8 border transition-all ${
                pipEnabled
                  ? "text-primary border-primary/40 bg-primary/10 hover:bg-primary/20"
                  : "text-zinc-500 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                fetchProjects();
                fetchStatuses();
              }}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:bg-zinc-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* WORKSPACE CONTENT AREA */}
        {activeProjectId ? (
          (() => {
            const activeProj = projects.find(p => p.id === activeProjectId);
            if (!activeProj) return null;

            const projectServices = activeProj.services || [];
            const anyRunning = projectServices.some(s => statuses[`${activeProj.id}_${s.id}`] === "Running");

            return (
              <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
                {/* Project Header Card */}
                <Card className="border-zinc-900 bg-zinc-950/40 relative shadow-sm">
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 pr-4 truncate flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-bold truncate text-zinc-150">
                          {activeProj.name}
                        </h3>
                        <Badge variant="outline" className="text-[10px] select-none text-zinc-550 border-zinc-850">
                          {projectServices.length} {projectServices.length === 1 ? 'Service' : 'Services'}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 truncate">
                        Language/Stack: {Array.from(new Set(projectServices.map(s => s.language || "Python"))).join(", ")}
                      </p>
                      {activeProj.description && (
                        <p className="text-xs text-zinc-400 mt-2 leading-relaxed" title={activeProj.description}>
                          {activeProj.description}
                        </p>
                      )}
                    </div>

                    {/* Project Controls */}
                    <div className="flex items-center space-x-3.5 flex-shrink-0 border-t md:border-t-0 border-zinc-900 pt-3 md:pt-0">
                      {/* Play/Stop All */}
                      {anyRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => handleStopProject(activeProj.id, e)}
                          className="h-8 px-4 text-xs space-x-1.5 font-medium shadow-md shadow-destructive/10"
                        >
                          <Square className="h-3 w-3 fill-zinc-100" />
                          <span>Stop Project</span>
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => handleStartProject(activeProj.id, e)}
                          className="h-8 px-4 text-xs space-x-1.5 bg-emerald-650 hover:bg-emerald-650 text-zinc-100 font-medium shadow-md shadow-emerald-500/10"
                        >
                          <Play className="h-3 w-3 fill-zinc-100" />
                          <span>Run Project</span>
                        </Button>
                      )}

                      <div className="h-6 w-px bg-zinc-850" />

                      {/* Config management */}
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDuplicateClick(activeProj, e)}
                          className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                          title="Duplicate Config"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleEditClick(activeProj, e)}
                          className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                          title="Edit Config"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteClick(activeProj.id, e)}
                          className="h-8 w-8 text-zinc-500 hover:text-destructive hover:bg-destructive/10"
                          title="Delete Project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Services Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {projectServices.map((service) => {
                    const serviceKey = `${activeProj.id}_${service.id}`;
                    const serviceStatus = statuses[serviceKey] || "Idle";

                    return (
                      <div
                        key={service.id}
                        className="flex items-center justify-between p-4 rounded-xl border transition-all duration-200 bg-zinc-950/40 border-zinc-900/80 hover:border-zinc-805 hover:bg-zinc-900/10"
                      >
                        <div className="flex items-start space-x-3.5 truncate flex-1 mr-3">
                          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1.5 ${
                            serviceStatus === "Running" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" :
                            serviceStatus === "Error" ? "bg-destructive animate-pulse" :
                            "bg-zinc-700"
                          }`} />
                          <div className="truncate flex-1 space-y-1">
                            <span className="text-xs font-bold text-zinc-200 block leading-none flex items-center space-x-2">
                              <span>{service.name}</span>
                              {service.language && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded">
                                  {service.language}
                                </span>
                              )}
                            </span>
                            {service.description && (
                              <span className="text-[11px] text-zinc-550 block truncate" title={service.description}>
                                {service.description}
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-zinc-550 block truncate bg-zinc-950/60 p-1 border border-zinc-900/60 rounded" title={service.command}>
                              {service.command}
                            </span>
                          </div>
                        </div>

                        {/* Service action controls */}
                        <div className="flex items-center space-x-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {serviceStatus === "Running" ? (
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleStopService(activeProj.id, service.id)}
                              className="h-7 w-7"
                              title="Stop Service"
                            >
                              <Square className="h-3 w-3 fill-zinc-150" />
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="icon"
                              onClick={() => handleStartService(activeProj.id, service.id)}
                              className="h-7 w-7 bg-emerald-600 hover:bg-emerald-555 text-zinc-100"
                              title="Start Service"
                            >
                              <Play className="h-3 w-3 fill-zinc-150" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Terminals Grid - Displaying all services concurrently */}
                <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-900/60 pt-4">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-2">
                      <Terminal className="h-4 w-4 text-primary" />
                      <span>Service Terminal Consoles</span>
                    </h4>
                    <label className="flex items-center space-x-1.5 text-zinc-550 select-none cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded bg-zinc-950 border-zinc-800 text-primary focus:ring-0 focus:ring-offset-0 scale-90"
                      />
                      <span>Auto-scroll all</span>
                    </label>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-4 overflow-y-auto pr-1">
                    {projectServices.map((s) => {
                      const status = statuses[`${activeProj.id}_${s.id}`] || "Idle";
                      const logs = projectLogs[s.id] || [];
                      
                      return (
                        <LogConsole
                          key={s.id}
                          projectId={activeProj.id}
                          serviceId={s.id}
                          serviceName={s.name}
                          logs={logs}
                          status={status}
                          onClear={() => handleClearLogs(activeProj.id, s.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          /* WELCOME / SYSTEM DASHBOARD */
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-8 flex flex-col justify-center">
            <div className="border border-primary/20 bg-gradient-to-r from-primary/10 via-transparent to-transparent rounded-2xl p-8 relative overflow-hidden shadow-sm">
              <div className="absolute right-8 bottom-4 opacity-5 pointer-events-none select-none">
                <Layers className="h-48 w-48 text-primary" />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-zinc-100 flex items-center space-x-3.5 mb-2">
                <span className="bg-primary/20 p-2 rounded-xl text-primary inline-block">
                  <Layers className="h-6 w-6 animate-pulse" />
                </span>
                <span>Servo Workspace Overview</span>
              </h3>
              <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
                Servo is your centralized language-agnostic process controller. Select configured projects from the sidebar to inspect services, control daemons, and monitor terminal outputs.
              </p>
              <div className="mt-6 flex space-x-3">
                <Button onClick={handleNewClick} className="bg-primary text-zinc-100 hover:bg-primary/95 shadow-md shadow-primary/10">
                  <Plus className="h-4 w-4 mr-1.5" /> Configure New Project
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    fetchProjects();
                    fetchStatuses();
                  }}
                  className="border-zinc-850 hover:bg-zinc-900 text-zinc-350 hover:text-zinc-200"
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh Dashboard
                </Button>
              </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-zinc-950/40 border border-zinc-900/85 p-5 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Project Stacks</span>
                <span className="text-2xl font-black text-zinc-250">{projects.length}</span>
              </div>
              <div className="bg-zinc-950/40 border border-zinc-900/85 p-5 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Total Services</span>
                <span className="text-2xl font-black text-zinc-250">{totalServicesCount}</span>
              </div>
              <div className="bg-zinc-950/40 border border-zinc-900/85 p-5 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Active Processes</span>
                <span className="text-2xl font-black text-emerald-450">{runningServicesCount}</span>
              </div>
            </div>

            {/* Active Processes Listing */}
            {runningServices.length > 0 ? (
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block px-1">
                  Active Running Processes
                </span>
                <div className="border border-zinc-900/80 rounded-xl overflow-hidden divide-y divide-zinc-900 bg-zinc-950/20">
                  {runningServices.map(({ project, service }) => {
                    return (
                      <div
                        key={`${project.id}_${service.id}`}
                        onClick={() => {
                          setActiveProjectId(project.id);
                        }}
                        className="flex items-center justify-between p-4 hover:bg-zinc-900/20 cursor-pointer transition-colors duration-150"
                      >
                        <div className="flex items-center space-x-3.5 truncate">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                          <div className="truncate space-y-0.5">
                            <span className="text-xs font-bold text-zinc-200 block">
                              {project.name} &rsaquo; {service.name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-550 block truncate">
                              CWD: {service.path}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-[9px] bg-zinc-900/60 border-zinc-800 text-zinc-450 uppercase select-none">
                            {service.language || "Python"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopService(project.id, service.id);
                            }}
                            className="h-7 w-7 text-zinc-505 hover:text-destructive"
                            title="Stop process"
                          >
                            <Square className="h-3 w-3 fill-zinc-150" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border border-zinc-900/80 rounded-xl p-8 bg-zinc-950/25 text-center text-zinc-505 text-xs italic">
                No active processes running. Select a project stack from the sidebar to launch process daemons.
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE & EDIT MODAL DIALOG */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-200 max-w-5xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Project Configuration" : "Add Project Configuration"}</DialogTitle>
            <DialogDescription>
              Configure the project stack. You can run multiple backend/frontend services in parallel.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-2">
            {dialogError && (
              <div className="p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs flex items-center space-x-2">
                <Info className="h-4 w-4 flex-shrink-0" />
                <span>{dialogError}</span>
              </div>
            )}

            {/* General Project Config */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-1.5">
                <label htmlFor="proj_name" className="text-xs font-semibold text-zinc-400">
                  Project Display Name
                </label>
                <Input
                  id="proj_name"
                  placeholder="e.g. Fullstack E-Commerce"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label htmlFor="proj_description" className="text-xs font-semibold text-zinc-400">
                  Project Description
                </label>
                <Input
                  id="proj_description"
                  placeholder="Short description of this project stack"
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                />
              </div>
            </div>

            {/* SERVICES SECTION */}
            <div className="border-t border-zinc-900 pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-zinc-300">Services Stack ({formState.services.length})</h3>
              </div>

              <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                {formState.services.map((service, index) => (
                  <div key={service.id} className="p-4 border border-zinc-900 bg-zinc-950/40 rounded-xl relative space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-xs font-bold text-primary">Service #{index + 1}</span>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleDuplicateServiceForm(index)}
                          className="text-zinc-500 hover:text-zinc-350 flex items-center space-x-1 text-xs"
                          title="Duplicate Service"
                        >
                          <Copy className="h-3.5 w-3.5 text-zinc-500" />
                          <span>Duplicate</span>
                        </button>
                        {formState.services.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveServiceForm(index)}
                            className="text-zinc-500 hover:text-destructive flex items-center space-x-1 text-xs"
                            title="Remove Service"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-zinc-500" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Service Name */}
                      <div className="space-y-1.5 col-span-2 md:col-span-1">
                        <label className="text-[11px] font-semibold text-zinc-400">
                          Service Name
                        </label>
                        <Input
                          placeholder="e.g. Frontend Web / Node Server"
                          value={service.name}
                          onChange={(e) => {
                            const updated = [...formState.services];
                            updated[index].name = e.target.value;
                            setFormState({ ...formState, services: updated });
                          }}
                        />
                      </div>

                      {/* Service Language selector */}
                      <div className="space-y-1.5 col-span-2 md:col-span-1">
                        <label className="text-[11px] font-semibold text-zinc-400">
                          Service Language / Stack
                        </label>
                        <Select
                          value={service.language || "Python"}
                          onChange={(e) => {
                            const newLang = e.target.value;
                            setFormState(prev => {
                              const updated = [...prev.services];
                              const newMode = newLang === "Node.js" ? "npm" : "file";
                              updated[index] = {
                                ...updated[index],
                                language: newLang,
                                mode: newMode,
                                command: ""
                              };
                              return { ...prev, services: updated };
                            });
                            if (newLang === "Node.js") {
                              fetchNpmScripts(service.id, service.path);
                            }
                          }}
                        >
                          {(() => {
                            const opts = [...installedLanguages];
                            if (service.language && !opts.includes(service.language)) {
                              opts.push(service.language);
                            }
                            return opts.map(lang => (
                              <option key={lang} value={lang}>
                                {lang === "Other" ? "Other / Shell" : lang}
                              </option>
                            ));
                          })()}
                        </Select>
                      </div>
                    </div>

                    {/* Service Description */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-zinc-400">
                        Service Description
                      </label>
                      <Input
                        placeholder={service.language === "Node.js" ? "Briefly describe what this service does (e.g. Node API / React Dev Server)" : "Briefly describe what this service does (e.g. handles payment gateway webhooks)"}
                        value={service.description || ""}
                        onChange={(e) => {
                          const updated = [...formState.services];
                          updated[index].description = e.target.value;
                          setFormState({ ...formState, services: updated });
                        }}
                      />
                    </div>

                    {service.language === "Node.js" ? (
                      /* Special Node.js Layout */
                      <div className="space-y-3 border-t border-zinc-900/60 pt-3">
                        {/* Execute CWD Path - Prominently featured for Node.js */}
                        <div className="p-3.5 bg-zinc-900/35 border border-zinc-900/90 rounded-xl space-y-2">
                          <label className="text-[11px] font-bold text-zinc-350 flex items-center space-x-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500 shadow-sm animate-pulse" />
                            <span>Node Project Folder (Execution Directory)</span>
                          </label>
                          <p className="text-[10px] text-zinc-500">
                            Select the directory containing your <code>package.json</code> file where the Node execution starts.
                          </p>
                          <div className="flex space-x-2">
                            <Input
                              placeholder="e.g. D:/Projects/Servo/gui"
                              value={service.path}
                              onChange={(e) => {
                                const pathVal = e.target.value;
                                const updated = [...formState.services];
                                updated[index].path = pathVal;
                                setFormState({ ...formState, services: updated });
                                fetchNpmScripts(service.id, pathVal);
                              }}
                              className="flex-1 bg-zinc-950/60 border-zinc-800"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleBrowsePath(index)}
                              className="border-zinc-800 hover:bg-zinc-900 text-zinc-350 h-9 px-3 flex-shrink-0 flex items-center space-x-1.5"
                            >
                              <FolderOpen className="h-4 w-4 text-zinc-450" />
                              <span className="text-xs">Browse Folder</span>
                            </Button>
                          </div>
                        </div>

                        {/* Execution Mode / Command Configuration */}
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <label className="text-[11px] font-semibold text-zinc-400">
                              Execution Command / Mode
                            </label>
                            <div className="flex p-0.5 bg-zinc-950 border border-zinc-900 rounded-lg max-w-sm w-full md:w-auto">
                              {(["npm", "custom"] as const).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => handleSetExecutionMode(index, m)}
                                  className={`flex-1 md:flex-none text-[10px] font-medium py-1 px-3 rounded-md transition-all duration-150 capitalize ${
                                    (service.mode || "npm") === m
                                      ? "bg-zinc-900 text-zinc-100 border border-zinc-800/80 shadow-sm"
                                      : "text-zinc-500 hover:text-zinc-350"
                                  }`}
                                >
                                  {m === "npm" ? "NPM Script" : "Custom Command"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mode Specific Inputs */}
                          {(service.mode || "npm") === "npm" && (
                            <div className="space-y-2">
                              {!service.path ? (
                                <div className="p-3.5 bg-zinc-950/40 border border-zinc-900 rounded-lg text-xs text-zinc-500 italic text-center">
                                  Please select a Node Project Folder above to scan for package scripts.
                                </div>
                              ) : npmScripts[service.id] && npmScripts[service.id].length > 0 ? (
                                <Select
                                  value={service.command.startsWith("npm run ") ? service.command.replace("npm run ", "") : service.command === "npm start" ? "start" : ""}
                                  onChange={(e) => {
                                    const scriptName = e.target.value;
                                    const cmd = scriptName === "start" ? "npm start" : `npm run ${scriptName}`;
                                    const updated = [...formState.services];
                                    updated[index].command = cmd;
                                    setFormState({ ...formState, services: updated });
                                  }}
                                  className="w-full"
                                >
                                  <option value="" disabled>-- Select NPM script --</option>
                                  {npmScripts[service.id].map((script) => (
                                    <option key={script} value={script}>
                                      {script}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <div className="flex flex-col p-3.5 bg-zinc-950/80 border border-zinc-900 rounded-lg text-xs space-y-2">
                                  <div className="text-zinc-500">
                                    No scripts loaded. Make sure the folder path contains a <code className="text-zinc-400">package.json</code> file.
                                  </div>
                                  <div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fetchNpmScripts(service.id, service.path)}
                                      className="h-8 border-zinc-800 text-zinc-300 hover:bg-zinc-900"
                                    >
                                      Scan package.json
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {(service.mode || "npm") === "custom" && (
                            <div className="flex space-x-2">
                              <Input
                                placeholder="e.g. npm run dev / node server.js"
                                value={service.command}
                                onChange={(e) => {
                                  const updated = [...formState.services];
                                  updated[index].command = e.target.value;
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="flex-1"
                              />
                            </div>
                          )}

                          {/* Execution Preview Panel */}
                          {service.command && (
                            <div className="p-2.5 bg-zinc-950/60 border border-zinc-900/80 rounded-lg font-mono text-[10px] space-y-1">
                              <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-semibold text-zinc-500">
                                <span>Active Execution Command:</span>
                                <span className="text-zinc-650 font-normal capitalize">{(service.mode || "npm")} mode</span>
                              </div>
                              <code className="text-emerald-400 block break-all font-mono">
                                {service.command}
                              </code>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Layout for Python / Go / Rust / Other */
                      <div className="space-y-4 border-t border-zinc-900/60 pt-3">
                        {/* Execute CWD Path */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-zinc-400">
                            Absolute Folder Path (cwd)
                          </label>
                          <div className="flex space-x-2">
                            <Input
                              placeholder="e.g. D:/Projects/App/backend"
                              value={service.path}
                              onChange={(e) => {
                                const pathVal = e.target.value;
                                const updated = [...formState.services];
                                updated[index].path = pathVal;
                                setFormState({ ...formState, services: updated });
                              }}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleBrowsePath(index)}
                              className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 h-9 px-2 flex-shrink-0"
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Venv Path - only for Python */}
                        {service.language === "Python" && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-zinc-400">
                              Venv Path (Optional)
                            </label>
                            <div className="flex space-x-2">
                              <Input
                                placeholder="e.g. D:/Projects/App/backend/.venv"
                                value={service.venv_path || ""}
                                onChange={(e) => {
                                  const updated = [...formState.services];
                                  updated[index].venv_path = e.target.value;
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleBrowseVenv(index)}
                                className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 h-9 px-2 flex-shrink-0"
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Execution Mode / Command Configuration */}
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-t border-zinc-900/60 pt-3">
                            <label className="text-[11px] font-semibold text-zinc-400">
                              Execution Mode
                            </label>
                            <div className="flex p-0.5 bg-zinc-950 border border-zinc-900 rounded-lg max-w-sm w-full md:w-auto">
                              {(["file", "custom"] as const).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => handleSetExecutionMode(index, m)}
                                  className={`flex-1 md:flex-none text-[10px] font-medium py-1 px-3 rounded-md transition-all duration-150 capitalize ${
                                    (service.mode || "file") === m
                                      ? "bg-zinc-900 text-zinc-100 border border-zinc-800/80 shadow-sm"
                                      : "text-zinc-500 hover:text-zinc-350"
                                  }`}
                                >
                                  {m === "file" ? "Script File" : "Custom Cmd"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mode Specific Inputs */}
                          {(service.mode || "file") === "file" && (
                            <div className="space-y-2">
                              {service.command ? (
                                <div className="flex items-center justify-between p-2.5 bg-zinc-950/80 border border-zinc-900 rounded-lg text-xs">
                                  <div className="flex items-center space-x-2 text-zinc-300 truncate">
                                    <FileCode className="h-4 w-4 text-primary flex-shrink-0" />
                                    <span className="font-mono text-[11px] truncate" title={service.command}>
                                      {service.command}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleBrowseCommandFile(index)}
                                    className="h-7 text-xs text-primary hover:text-primary/80 hover:bg-transparent px-2 flex-shrink-0"
                                  >
                                    Change File
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleBrowseCommandFile(index)}
                                  className="w-full border-zinc-800 hover:bg-zinc-900 text-zinc-300 h-10 flex items-center justify-center space-x-2 bg-zinc-950/40 border-dashed"
                                >
                                  <FolderOpen className="h-4 w-4 text-zinc-400" />
                                  <span className="text-xs">Browse Script / Executable File...</span>
                                </Button>
                              )}
                            </div>
                          )}

                          {(service.mode || "file") === "custom" && (
                            <div className="flex space-x-2">
                              <Input
                                placeholder="e.g. python main.py / go run main.go"
                                value={service.command}
                                onChange={(e) => {
                                  const updated = [...formState.services];
                                  updated[index].command = e.target.value;
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="flex-1"
                              />
                            </div>
                          )}

                          {/* Execution Preview Panel */}
                          {service.command && (
                            <div className="p-2.5 bg-zinc-950/60 border border-zinc-900/80 rounded-lg font-mono text-[10px] space-y-1">
                              <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-semibold text-zinc-500">
                                <span>Active Execution Command:</span>
                                <span className="text-zinc-650 font-normal capitalize">{(service.mode || "file")} mode</span>
                              </div>
                              <code className="text-emerald-400 block break-all font-mono">
                                {getResolvedCommandPreview(service, service.language || "Python")}
                              </code>
                            </div>
                          )}
                        </div>

                        {/* Venv Activation Checkbox */}
                        {service.language === "Python" && service.venv_path && service.venv_path.trim() !== "" && (
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`use_venv_${index}`}
                              checked={service.use_venv}
                              onChange={(e) => {
                                const updated = [...formState.services];
                                updated[index].use_venv = e.target.checked;
                                setFormState({ ...formState, services: updated });
                              }}
                              className="rounded bg-zinc-950 border-zinc-800 text-primary focus:ring-0 focus:ring-offset-0 h-4 w-4"
                            />
                            <label htmlFor={`use_venv_${index}`} className="text-xs text-zinc-400 cursor-pointer select-none">
                              Activate virtual environment path for execution
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Service Button at the bottom of the list */}
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddServiceForm}
                    className="w-full border-zinc-800 border-dashed hover:bg-zinc-900 text-zinc-350 h-10 flex items-center justify-center space-x-2 bg-zinc-950/40"
                  >
                    <Plus className="h-4 w-4 text-zinc-400" />
                    <span>Add Service to Stack</span>
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-zinc-900">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-zinc-100 hover:bg-primary/90">
                {isEditMode ? "Update Project" : "Add Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Entry point router ────────────────────────────────────────────────────────
export default function AppRoot() {
  if (IS_PIP_MODE) return <PipView />;
  return <App />;
}
