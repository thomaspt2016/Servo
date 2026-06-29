import React, { useState, useEffect, Suspense, lazy } from "react";
import {
  Layers,
  Terminal,
  RefreshCw,
  PictureInPicture2,
  AlertTriangle
} from "lucide-react";

// Import custom UI components
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import type { Project, Service, FormState, GitInfo } from "./types";
import { PipView } from './components/PipView';
import { LogConsole } from './components/LogConsole';

const Sidebar = lazy(() => import('./components/Sidebar'));
const DashboardOverview = lazy(() => import('./components/DashboardOverview'));
const ProjectWorkspace = lazy(() => import('./components/ProjectWorkspace'));
const ProjectConfigDialog = lazy(() => import('./components/ProjectConfigDialog'));

const getApi = () => {
  return window.pywebview!.api;
};

// Computed once at module load — never changes during the lifetime of this window
// Uses hash (#pip, #toast) because query params (?mode=pip) don't work on file:// URLs
const IS_PIP_MODE = window.location.hash === "#pip";
const IS_TOAST_MODE = window.location.hash.startsWith("#toast");

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  if (IS_TOAST_MODE) {
    let title = "Servo Alert";
    let message = "Service crashed.";
    try {
      const qs = window.location.hash.split('?')[1];
      if (qs) {
        const params = new URLSearchParams(qs);
        title = params.get('title') || title;
        message = params.get('message') || message;
      }
    } catch(e) {}

    return (
      <div className="w-full h-full h-screen w-screen overflow-hidden bg-transparent p-2">
        <div className="w-full h-full bg-zinc-950/95 backdrop-blur-md border border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.25)] rounded-xl flex items-center p-4">
           <div className="bg-red-500/20 p-2.5 rounded-full mr-4 flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-500" />
           </div>
           <div className="flex flex-col overflow-hidden justify-center space-y-1">
               <h3 className="text-zinc-100 font-bold text-sm truncate">{title}</h3>
               <p className="text-zinc-400 text-xs truncate leading-snug">{message}</p>
           </div>
        </div>
      </div>
    );
  }

  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [dependencyStatuses, setDependencyStatuses] = useState<Record<string, string | null>>({});
  const [activePorts, setActivePorts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<Record<string, {cpu: number, memory: number}>>({});
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


  
  const [terminals, setTerminals] = useState<{id: string, cwd?: string, isCollapsed?: boolean}[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [showTerminalPanel, setShowTerminalPanel] = useState(false);
  
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<{projectId: string, serviceId: string} | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [npmScripts, setNpmScripts] = useState<Record<string, string[]>>({});
  const [gitInfoMap, setGitInfoMap] = useState<Record<string, GitInfo>>({});
  const [isDockerRunning, setIsDockerRunning] = useState<boolean>(true);
  const [dockerContainers, setDockerContainers] = useState<Record<string, {name: string, state: string}[]>>({});

  const handleSelectProject = (id: string | null) => {
    setActiveProjectId(id);
    setIsDialogOpen(false);
  };

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

  const fetchAllGitInfo = async (projectList?: Project[]) => {
    const list = projectList ?? projects;
    if (!list.length) return;
    try {
      const results = await Promise.all(
        list.map(async (p) => {
          try {
            const reposRes = await getApi().git_get_repos(p.id);
            if (reposRes.repos && reposRes.repos.length > 0) {
              const info = await getApi().git_get_info(p.id, reposRes.repos[0].path);
              return { id: p.id, info };
            }
            return { id: p.id, info: null };
          } catch {
            return { id: p.id, info: null };
          }
        })
      );
      const map: Record<string, GitInfo> = {};
      results.forEach((r) => { if (r.info) map[r.id] = r.info; });
      setGitInfoMap(map);
    } catch (err) {
      console.error("Error fetching git info:", err);
    }
  };

  const fetchDockerContainers = async () => {
    try {
      const isRunning = await getApi().check_docker_status();
      setIsDockerRunning(isRunning);
      if (isRunning) {
        const containers = await getApi().get_docker_containers();
        setDockerContainers(containers);
      } else {
        setDockerContainers({});
      }
    } catch (err) {
      console.error("Error fetching docker containers:", err);
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

  const [formState, setFormState] = useState<FormState>({
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

    if (window.pywebview && window.pywebview.api && (window.pywebview.api as any).report_focus) {
      const handleFocus = () => (window.pywebview!.api as any).report_focus(true).catch(() => {});
      const handleBlur = () => (window.pywebview!.api as any).report_focus(false).catch(() => {});
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);
    }

    fetchProjects();
    fetchStatuses();
    fetchMetrics();
    fetchInstalledLanguages();
    // Restore PiP feature state from previous session (window stays hidden until needed)
    if (pipEnabled) {
      getApi().open_pip().catch(() => {});
    }
    const interval = setInterval(() => {
      fetchStatuses();
      fetchActivePorts();
      fetchMetrics();
      fetchDockerContainers();
    }, 1000);
    // Refresh git info every 30s
    const gitInterval = setInterval(() => fetchAllGitInfo(), 30000);
    
    const handleConfigChange = () => {
      fetchProjects();
    };
    window.addEventListener("servo-config-changed", handleConfigChange);

    return () => { 
      clearInterval(interval); 
      clearInterval(gitInterval); 
      window.removeEventListener("servo-config-changed", handleConfigChange);
    };
  }, [isDesktop]);



  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await getApi().load_projects();
      setProjects(data);
      fetchAllGitInfo(data);
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
      if (getApi().get_dependency_statuses) {
        const depData = await getApi().get_dependency_statuses();
        setDependencyStatuses(depData);
      }
      if (getApi().check_docker_status) {
        const dockerStatus = await getApi().check_docker_status();
        setIsDockerRunning(dockerStatus);
      }
      if (getApi().get_docker_containers) {
        const containers = await getApi().get_docker_containers();
        setDockerContainers(containers);
      }
    } catch (err) {
      console.error("Error fetching statuses:", err);
    }
  };

  const fetchActivePorts = async () => {
    try {
      if (getApi().get_active_ports) {
        const data = await getApi().get_active_ports();
        setActivePorts(data);
      }
    } catch (err) {
      console.error("Error fetching active ports:", err);
    }
  };

  const fetchMetrics = async () => {
    try {
      const data = await getApi().get_metrics();
      setMetrics(data);
    } catch (err) {
      console.error("Error fetching metrics:", err);
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

  const handleInstallDependencies = async (projectId: string, serviceId: string) => {
    try {
      const success = await getApi().install_dependencies(projectId, serviceId);
      if (success) {
        fetchStatuses();
        setActiveProjectId(projectId);
      }
    } catch (err) {
      console.error("Failed to install dependencies:", err);
    }
  };



  const handleNewTerminal = async () => {
    let cwd: string | undefined = undefined;
    if (activeProjectId) {
      const proj = projects.find(p => p.id === activeProjectId);
      if (proj && proj.services.length > 0) {
        cwd = proj.services[0].path;
      }
    }
    const newId = `term_${Date.now()}`;
    setTerminals(prev => [...prev, { id: newId, cwd, isCollapsed: false }]);
    setActiveTerminalId(newId);
    setShowTerminalPanel(true);
    
    try {
      await getApi().start_raw_terminal(newId, cwd);
    } catch (err) {
      console.error("Failed to start raw terminal:", err);
    }
  };

  const handleCloseTerminal = async (termId: string) => {
    try {
      await getApi().stop_service("terminal", termId);
    } catch (err) {}
    
    setTerminals(prev => {
      const newTerms = prev.filter(t => t.id !== termId);
      if (activeTerminalId === termId) {
        setActiveTerminalId(newTerms.length > 0 ? newTerms[newTerms.length - 1].id : null);
      }
      if (newTerms.length === 0) {
        setShowTerminalPanel(false);
      }
      return newTerms;
    });
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

  const handleDeleteServiceClick = async (projectId: string, serviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setServiceToDelete({ projectId, serviceId });
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    const { projectId, serviceId } = serviceToDelete;
    
    try {
      const proj = projects.find(p => p.id === projectId);
      if (!proj) return;
      
      const updatedProj = { ...proj, services: proj.services.filter(s => s.id !== serviceId) };
      const success = await getApi().save_project(updatedProj);
      if (success) {
        fetchProjects();
      }
    } catch (err) {
      console.error("Failed to delete service:", err);
    } finally {
      setServiceToDelete(null);
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
      path: formState.services[0]?.path.trim() || "",
      services: formState.services.map(s => ({
        id: s.id,
        name: s.name.trim(),
        description: s.description.trim() || undefined,
        path: s.path.trim(),
        command: s.command.trim(),
        venv_path: s.venv_path.trim() || undefined,
        use_venv: s.use_venv,
        env_vars: s.env_vars,
        language: s.language || "Python",
        mode: s.mode
      }))
    };

    try {
      const success = await getApi().save_project(projectToSave);
      if (success) {
        setTimeout(() => setIsDialogOpen(false), 150);
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
      path: project.path,
      services: project.services.map(s => {
        let mode = s.mode;
        if (!mode) {
          mode = "custom";
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
        }

        return {
          id: s.id,
          name: s.name,
          description: s.description || "",
          path: s.path,
          command: s.command,
          venv_path: s.venv_path || "",
          use_venv: s.use_venv !== false,
          env_vars: s.env_vars || [],
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
      let mode = s.mode;
      if (!mode) {
        mode = "custom";
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
        env_vars: s.env_vars || [],
        language: s.language || "Python",
        mode
      };
    });

    setFormState({
      id: "", // Empty ID triggers new project configuration on save
      name: `${project.name} (Copy)`,
      description: project.description || "",
      category: project.category,
      path: project.path,
      services: newServices
    });
    setIsEditMode(false); // Duplicate is creating a new project based on an old one
    setDialogError("");
    setIsDialogOpen(true);
  };

  // Delete Project Click
  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      const success = await getApi().delete_project(projectToDelete);
      if (success) {
        if (activeProjectId === projectToDelete) {
          setActiveProjectId(null);
        }
        fetchProjects();
        fetchStatuses();
      }
    } catch (err) {
      console.error(err);
    }
    setProjectToDelete(null);
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

  const handleImportClick = async () => {
    try {
      await getApi().import_project();
    } catch (e) {
      console.error(e);
    }
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

  const handleAutoDetectServices = async () => {
    try {
      const selectedPath = await getApi().pick_folder(null);
      if (selectedPath) {
        const detectedServices = await getApi().scan_folder_for_services(selectedPath);
        if (detectedServices && detectedServices.length > 0) {
          const mappedServices = detectedServices.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: "",
            path: s.path,
            command: s.command,
            venv_path: s.venv_path || "",
            use_venv: !!s.use_venv,
            language: s.language,
            mode: "custom" as const
          }));
          
          setFormState(prev => {
            let newServices = [...prev.services];
            if (newServices.length === 1 && !newServices[0].path && !newServices[0].command) {
              newServices = mappedServices;
            } else {
              newServices = [...newServices, ...mappedServices];
            }
            const projName = prev.name || selectedPath.split(/[/\\]/).pop() || "Auto Project";
            return { ...prev, name: projName, services: newServices };
          });
          setDialogError("");
        } else {
          setDialogError(`No known services detected in the selected folder.`);
        }
      }
    } catch (err) {
      console.error("Error auto-detecting services:", err);
      setDialogError("Failed to auto-detect services.");
    }
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

  const runningServices: { project: Project; service: Service }[] = [];
  projects.forEach(proj => {
    (proj.services || []).forEach(svc => {
      if (statuses[`${proj.id}_${svc.id}`] === "Running") {
        runningServices.push({ project: proj, service: svc });
      }
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground text-zinc-300">
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading sidebar...</div>}>
        <Sidebar
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredProjects={filteredProjects}
          loading={loading}
          activeProjectId={activeProjectId}
          setActiveProjectId={handleSelectProject}
          statuses={statuses}
          gitInfoMap={gitInfoMap}
          handleNewClick={handleNewClick}
          handleEditClick={handleEditClick}
          handleDeleteClick={handleDeleteClick}
          handleImportClick={handleImportClick}
          isDockerRunning={isDockerRunning}
        />
      </Suspense>

      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950/20">
        <header className="h-16 border-b border-zinc-900 bg-zinc-950/50 px-8 flex items-center justify-between glass z-10">
          <div className="flex items-center space-x-3">
            <Layers className="h-5 w-5 text-primary/80" />
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              {activeProjectId ? "Project Workspace" : "Dashboard Overview"}
            </h2>
          </div>

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
              size="sm"
              onClick={handleNewTerminal}
              className={`h-8 px-3 text-xs space-x-1.5 border transition-all ${
                showTerminalPanel
                  ? "text-primary border-primary/40 bg-primary/10 hover:bg-primary/20"
                  : "text-zinc-500 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{terminals.length > 0 ? `Terminal (${terminals.length})` : "Terminal"}</span>
            </Button>
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

        {isDialogOpen ? (
          <Suspense fallback={<div className="p-8 text-zinc-500">Loading config...</div>}>
            <ProjectConfigDialog
              isDialogOpen={isDialogOpen}
              setIsDialogOpen={setIsDialogOpen}
              isEditMode={isEditMode}
              dialogError={dialogError}
              formState={formState}
              setFormState={setFormState}
              installedLanguages={installedLanguages}
              npmScripts={npmScripts}
              fetchNpmScripts={fetchNpmScripts}
              handleSave={handleSave}
              handleAutoDetectServices={handleAutoDetectServices}
              handleDuplicateServiceForm={handleDuplicateServiceForm}
              handleRemoveServiceForm={handleRemoveServiceForm}
              handleBrowsePath={handleBrowsePath}
              handleBrowseVenv={handleBrowseVenv}
              handleSetExecutionMode={handleSetExecutionMode}
              handleBrowseCommandFile={handleBrowseCommandFile}
              handleAddServiceForm={handleAddServiceForm}
            />
          </Suspense>
        ) : activeProjectId ? (
          (() => {
            const activeProj = projects.find(p => p.id === activeProjectId);
            if (!activeProj) return null;
            return (
              <Suspense fallback={<div className="p-8 text-zinc-500">Loading workspace...</div>}>
                <ProjectWorkspace
                  activeProj={projects.find(p => p.id === activeProjectId)!}
                  statuses={statuses}
                  dependencyStatuses={dependencyStatuses}
                  activePorts={activePorts}
                  isDockerRunning={isDockerRunning}
                  dockerContainers={dockerContainers}
                  metrics={metrics}
                  handleStopProject={handleStopProject}
                  handleStartProject={handleStartProject}
                  handleDuplicateClick={handleDuplicateClick}
                  handleEditClick={handleEditClick}
                  handleDeleteClick={handleDeleteClick}
                  handleDeleteServiceClick={handleDeleteServiceClick}
                  handleStopService={handleStopService}
                  handleStartService={handleStartService}
                  handleInstallDependencies={handleInstallDependencies}
                  autoScroll={autoScroll}
                  setAutoScroll={setAutoScroll}
                  onBack={() => setActiveProjectId(null)}
                  onGitInfoChange={(projectId, info) => {
                    if (info) setGitInfoMap(prev => ({ ...prev, [projectId]: info }));
                    else setGitInfoMap(prev => { const next = { ...prev }; delete next[projectId]; return next; });
                  }}
                />
              </Suspense>
            );
          })()
        ) : (
          <Suspense fallback={<div className="p-8 text-zinc-500">Loading dashboard...</div>}>
            <DashboardOverview
              projects={projects}
              totalServicesCount={totalServicesCount}
              runningServicesCount={runningServicesCount}
              runningServices={runningServices}
              metrics={metrics}
              handleNewClick={handleNewClick}
              fetchProjects={fetchProjects}
              fetchStatuses={fetchStatuses}
              setActiveProjectId={handleSelectProject}
              handleStopService={handleStopService}
            />
          </Suspense>
        )}

        {/* Terminal Panel */}
        {showTerminalPanel && terminals.length > 0 && (
          <div className="h-auto max-h-[60vh] border-t border-zinc-900 bg-zinc-950 flex flex-col z-20 overflow-y-auto">
            <div className="flex-1 flex flex-col p-4 gap-4">
              <Suspense fallback={<div>Loading terminal...</div>}>
                {terminals.map((t, index) => (
                  <LogConsole
                    key={t.id}
                    projectId="terminal"
                    serviceId={t.id}
                    serviceName={`Terminal ${index + 1}`}
                    status={statuses[`terminal_${t.id}`] || "Running"}
                    isCollapsed={t.isCollapsed}
                    onToggleCollapse={() => {
                      setTerminals(prev => prev.map(term => term.id === t.id ? { ...term, isCollapsed: !term.isCollapsed } : term));
                    }}
                    onKill={() => handleCloseTerminal(t.id)}
                  />
                ))}
              </Suspense>
            </div>
          </div>
        )}
      </main>

      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300 py-2">
            Are you sure you want to permanently delete this project configuration?
            <br />
            This will not delete the project files on your drive, only the Servo configuration.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProjectToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Dialog */}
      <Dialog open={!!serviceToDelete} onOpenChange={(open) => !open && setServiceToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300 py-2">
            Are you sure you want to permanently delete this service from the stack?
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setServiceToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteService}>Delete</Button>
          </DialogFooter>
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
