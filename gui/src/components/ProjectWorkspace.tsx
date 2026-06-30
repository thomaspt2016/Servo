import React, { useState } from "react";
import { Play, Square, Copy, Edit2, Trash2, Terminal, Package, ArrowLeft, GitBranch, ChevronDown, ArrowUp, ArrowDown, Check, Circle, AlertTriangle, FolderOpen, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogConsole } from "./LogConsole";
import { GitPanel } from "./GitPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Project, GitInfo } from "../types";

const getApi = () => {
  return (window as any).pywebview.api;
};

export interface ProjectWorkspaceProps {
  activeProj: Project;
  statuses: Record<string, string>;
  dependencyStatuses: Record<string, string | null>;
  activePorts: Record<string, number>;
  isDockerRunning?: boolean;
  dockerContainers?: Record<string, {name: string, state: string}[]>;
  metrics?: Record<string, {cpu: number, memory: number}>;
  handleStopProject: (projectId: string, e?: React.MouseEvent) => void;
  handleStartProject: (projectId: string, e?: React.MouseEvent) => void;
  handleDuplicateClick: (project: Project, e: React.MouseEvent) => void;
  handleEditClick: (project: Project, e: React.MouseEvent) => void;
  handleDeleteClick: (id: string, e: React.MouseEvent) => void;
  handleDeleteServiceClick: (projectId: string, serviceId: string, e: React.MouseEvent) => void;
  handleStopService: (projectId: string, serviceId: string) => void;
  handleStartService: (projectId: string, serviceId: string) => void;
  handleInstallDependencies: (projectId: string, serviceId: string) => void;
  autoScroll: boolean;
  setAutoScroll: (val: boolean) => void;
  onBack?: () => void;
  onGitInfoChange?: (projectId: string, info: GitInfo | null) => void;
}

export default function ProjectWorkspace({
  activeProj,
  statuses,
  dependencyStatuses,
  activePorts,
  isDockerRunning,
  dockerContainers,
  metrics,
  handleStopProject,
  handleStartProject,
  handleDuplicateClick,
  handleEditClick,
  handleDeleteClick,
  handleDeleteServiceClick,
  handleStopService,
  handleStartService,
  handleInstallDependencies,
  autoScroll,
  setAutoScroll,
  onBack,
  onGitInfoChange,
}: ProjectWorkspaceProps) {
  const projectServices = activeProj.services || [];
  const anyRunning = projectServices.some(s => statuses[`${activeProj.id}_${s.id}`] === "Running");

  React.useEffect(() => {
    projectServices.forEach(s => {
      if (getApi().warmup_service_terminal) {
        getApi().warmup_service_terminal(activeProj.id, s.id).catch(() => {});
      }
    });
  }, [activeProj.id]);

  const [showGitPanel, setShowGitPanel] = useState(false);
  const [gitSummary, setGitSummary] = useState<GitInfo | null>(null);

  const uniquePaths = Array.from(new Set(projectServices.map(s => s.path).filter(p => p && p.trim() !== "")));

  const handleOpenFolder = (path: string) => {
    if (getApi().open_in_editor) {
       // We pass "explorer" to fall back to the system default file manager
       getApi().open_in_editor(path);
    }
  };

  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [installedEditors, setInstalledEditors] = useState<{name: string, path: string}[]>([]);
  const [preferredEditorName, setPreferredEditorName] = useState("Folder");

  React.useEffect(() => {
    const fetchEditor = async () => {
      if (getApi().get_preferred_editor_info) {
        const info = await getApi().get_preferred_editor_info();
        if (info && info.name) {
          setPreferredEditorName(info.name);
        }
      }
    };
    fetchEditor();
  }, []);

  const handleSelectEditor = async () => {
    if (getApi().get_installed_editors) {
      const editors = await getApi().get_installed_editors();
      setInstalledEditors(editors);
    }
    setEditorDialogOpen(true);
  };

  const onSelectEditor = async (path: string, name?: string) => {
    if (getApi().set_preferred_editor) {
      const res = await getApi().set_preferred_editor(path, name);
      if (res && res.name) {
        setPreferredEditorName(res.name);
      }
      setEditorDialogOpen(false);
    }
  };

  const onBrowseEditor = async () => {
    if (getApi().select_editor_dialog) {
      const res = await getApi().select_editor_dialog();
      if (res && res.success) {
        if (res.name) {
          setPreferredEditorName(res.name);
        }
        setEditorDialogOpen(false);
      }
    }
  };

  const [openLogContainers, setOpenLogContainers] = useState<Record<string, boolean>>({});
  const [containerLogs, setContainerLogs] = useState<Record<string, string>>({});

  const toggleContainerLogs = (containerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenLogContainers(prev => ({
      ...prev,
      [containerName]: !prev[containerName]
    }));
  };

  React.useEffect(() => {
    const activeContainers = Object.keys(openLogContainers).filter(k => openLogContainers[k]);
    if (activeContainers.length === 0) return;

    const fetchLogs = async () => {
      for (const cName of activeContainers) {
        try {
          const logs = await getApi().get_docker_container_logs(cName);
          setContainerLogs(prev => ({ ...prev, [cName]: logs }));
        } catch (err) {
          console.error(`Failed to fetch logs for ${cName}`, err);
        }
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [openLogContainers]);

  const handleStopContainer = async (containerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getApi().stop_docker_container(containerName);
    } catch (err) {
      console.error("Failed to stop container", err);
    }
  };

  const handleStartContainer = async (containerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getApi().start_docker_container(containerName);
    } catch (err) {
      console.error("Failed to start container", err);
    }
  };
  
  const handleStopAllContainers = async (serviceKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dockerContainers || !dockerContainers[serviceKey]) return;
    for (const c of dockerContainers[serviceKey]) {
      if (c.state === 'running') {
        getApi().stop_docker_container(c.name).catch(() => {});
      }
    }
  };
  const [alertConfig, setAlertConfig] = useState<{ open: boolean, title: string, message: React.ReactNode }>({ open: false, title: "", message: "" });
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean, title: string, message: React.ReactNode, onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });


  if (activeProj.health_status && activeProj.health_status !== 'active') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-2" />
        <h2 className="text-xl font-bold text-zinc-100">Project Unavailable</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          {activeProj.health_status === 'missing' && "The directory for this project could not be found. It may have been moved or deleted."}
          {activeProj.health_status === 'uninitialized' && "The project folder exists, but the .servo.json configuration file is missing. Would you like to initialize it now?"}
          {activeProj.health_status === 'corrupted' && "The .servo.json configuration file has syntax errors and could not be parsed. Please fix the JSON syntax manually."}
        </p>
        <div className="flex space-x-4 mt-4">
          {onBack && <Button variant="outline" onClick={onBack}>Go Back</Button>}
          {activeProj.health_status === 'missing' && (
            <Button onClick={() => {
              getApi().pick_folder().then((path: string | null) => {
                if (path) {
                  getApi().save_project({ ...activeProj, path }).then(() => {
                    window.dispatchEvent(new CustomEvent('servo-config-changed'));
                  });
                }
              });
            }}>
              Locate Folder
            </Button>
          )}
          {activeProj.health_status === 'uninitialized' && (
            <Button onClick={() => {
              getApi().save_project(activeProj).then(() => {
                window.dispatchEvent(new CustomEvent('servo-config-changed'));
              });
            }}>
              Initialize Servo
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
      {/* Project Header Card */}
      <Card className="border-zinc-900 bg-zinc-950/40 relative shadow-sm">
        <CardContent className="p-3 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center space-x-2 mb-1">
                {onBack && (
                  <Button variant="ghost" size="icon" onClick={onBack} className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 -ml-1">
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                )}
                <h3 className="text-base font-bold truncate text-zinc-150">
                  {activeProj.name}
                </h3>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 select-none text-zinc-550 border-zinc-850">
                  {projectServices.length} {projectServices.length === 1 ? 'Service' : 'Services'}
                </Badge>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
                <span className="truncate">Stack: {Array.from(new Set(projectServices.map(s => s.language || "Python"))).join(", ")}</span>
                {activeProj.description && (
                  <>
                    <span className="text-zinc-700">•</span>
                    <span className="truncate text-zinc-400" title={activeProj.description}>{activeProj.description}</span>
                  </>
                )}
              </div>
            </div>

            {/* Project Controls */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Play/Stop All */}
              {anyRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => handleStopProject(activeProj.id, e)}
                  className="h-7 px-3 text-[11px] space-x-1.5 font-medium shadow-md shadow-destructive/10"
                >
                  <Square className="h-3 w-3 fill-zinc-100" />
                  <span>Stop Project</span>
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false}
                  onClick={(e) => handleStartProject(activeProj.id, e)}
                  className={`h-7 px-3 text-[11px] space-x-1.5 font-medium shadow-md ${projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' : 'bg-emerald-650 hover:bg-emerald-650 text-zinc-100 shadow-emerald-500/10'}`}
                  title={projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false ? "Docker is not running" : "Run Project"}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Run Project</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rootPath = activeProj.path || (uniquePaths.length > 0 ? uniquePaths[0] : "");
                  if (rootPath) handleOpenFolder(rootPath);
                }}
                className="h-7 px-3 text-[11px] font-medium border-zinc-800 hover:bg-zinc-800 text-zinc-300"
                disabled={!activeProj.path && uniquePaths.length === 0}
              >
                <FolderOpen className="h-3 w-3 mr-1.5" />
                <span>Open {preferredEditorName !== "Folder" ? `in ${preferredEditorName}` : "Project"}</span>
              </Button>

              <div className="h-4 w-px bg-zinc-850" />

              {/* Config management */}
              <div className="flex items-center space-x-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDuplicateClick(activeProj, e)}
                  className="h-7 w-7 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                  title="Duplicate Config"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleEditClick(activeProj, e)}
                  className="h-7 w-7 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                  title="Edit Config"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDeleteClick(activeProj.id, e)}
                  className="h-7 w-7 text-zinc-500 hover:text-destructive hover:bg-destructive/10"
                  title="Delete Project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Project Folders Section (Merged for compactness) */}
          {uniquePaths.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-900/60">
              {uniquePaths.map(path => {
                const folderName = path.split(/[/\\]/).pop() || path;
                return (
                  <div key={path} className="flex items-center bg-zinc-950/60 border border-zinc-900/80 rounded-md px-2 py-1 shadow-sm hover:border-zinc-800 transition-colors">
                    <FolderOpen className="h-3.5 w-3.5 text-zinc-500 mr-2 flex-shrink-0" />
                    <span className="text-[11px] font-mono text-zinc-300 truncate mr-3 max-w-[150px]" title={path}>{folderName}</span>
                    <div className="flex items-center flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenFolder(path)} className="h-6 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2 border border-primary/20 rounded-r-none border-r-0">
                        Open {preferredEditorName !== "Folder" ? `in ${preferredEditorName}` : "Folder"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={handleSelectEditor} className="h-6 w-6 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-l-none" title="Select Editor">
                        <Settings className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projectServices.map((service) => {
          const serviceKey = `${activeProj.id}_${service.id}`;
          const serviceStatus = statuses[serviceKey] || "Idle";
          const isDockerService = service.language === "Docker Compose" || service.language === "Docker" || service.command.toLowerCase().includes("docker");
          const startDisabled = isDockerService && isDockerRunning === false;
          const hasOpenLogs = dockerContainers && dockerContainers[serviceKey] && dockerContainers[serviceKey].some(c => openLogContainers[c.name]);

          return (
            <div
              key={service.id}
              className={`flex justify-between p-4 rounded-xl border transition-all duration-200 bg-zinc-950/40 border-zinc-900/80 hover:border-zinc-805 hover:bg-zinc-900/10 ${hasOpenLogs ? 'lg:col-span-2 items-start' : 'items-center'}`}
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
                    {serviceStatus === "Running" && activePorts[serviceKey] && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 rounded flex items-center shadow-sm">
                        📍 :{activePorts[serviceKey]}
                      </span>
                    )}
                    {startDisabled && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-amber-900/30 border border-amber-500/30 text-amber-500 rounded flex items-center shadow-sm" title="Docker Engine is not running">
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Docker Not Running
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
                  {dockerContainers && dockerContainers[serviceKey] && dockerContainers[serviceKey].length > 0 && (
                    <div className="mt-2 flex flex-col space-y-1 w-full pr-4">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Containers</span>
                        {dockerContainers[serviceKey].some(c => c.state === 'running') && (
                          <button
                            onClick={(e) => handleStopAllContainers(serviceKey, e)}
                            className="text-[9px] px-1.5 py-0.5 rounded border border-red-900/50 text-red-400 hover:bg-red-950/30 transition-colors"
                          >
                            Stop All
                          </button>
                        )}
                      </div>
                      {dockerContainers[serviceKey].map(c => (
                        <div key={c.name} className="flex flex-col w-full">
                          <div className="flex items-center space-x-2 text-[10px] font-mono text-zinc-400 bg-zinc-950/40 p-1 pl-2 pr-1 border border-zinc-900/60 rounded max-w-fit">
                            <span className="truncate max-w-[400px] flex items-center">
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 ${c.state === 'running' ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`}></span>
                              {c.name}
                            </span>
                            <div className="flex items-center space-x-1 border-l border-zinc-800 pl-2">
                              <button
                                onClick={(e) => toggleContainerLogs(c.name, e)}
                                className={`transition-colors px-1 ${openLogContainers[c.name] ? 'text-primary' : 'text-zinc-500 hover:text-zinc-300'}`}
                                title="Toggle Logs"
                              >
                                Logs
                              </button>
                              {c.state === 'running' ? (
                                <button
                                  onClick={(e) => handleStopContainer(c.name, e)}
                                  className="text-red-400/70 hover:text-red-400 transition-colors px-1"
                                  title="Stop Container"
                                >
                                  Stop
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => handleStartContainer(c.name, e)}
                                  className="text-emerald-400/70 hover:text-emerald-400 transition-colors px-1"
                                  title="Start Container"
                                >
                                  Start
                                </button>
                              )}
                            </div>
                          </div>
                          {openLogContainers[c.name] && (
                            <div className="w-full bg-[#0a0a0a] rounded border border-zinc-800/80 p-3 overflow-y-auto max-h-[600px] mt-2 mb-3 shadow-inner">
                              <pre className="text-[10px] font-mono text-zinc-300 whitespace-pre-wrap m-0">
                                {containerLogs[c.name] || 'Loading logs...'}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics display */}
              {serviceStatus === "Running" && metrics && metrics[serviceKey] && (
                <div className="flex items-center space-x-3 mr-4 text-[10px] text-zinc-500 font-mono flex-shrink-0">
                  <div className="flex items-center space-x-1" title="CPU Usage">
                    <span className="text-zinc-600">CPU:</span>
                    <span className={metrics[serviceKey].cpu > 80 ? "text-amber-500 font-bold" : "text-zinc-300"}>
                      {metrics[serviceKey].cpu}%
                    </span>
                  </div>
                  <div className="flex items-center space-x-1" title="Memory Usage">
                    <span className="text-zinc-600">RAM:</span>
                    <span className={metrics[serviceKey].memory > 1024 ? "text-amber-500 font-bold" : "text-zinc-300"}>
                      {metrics[serviceKey].memory} MB
                    </span>
                  </div>
                </div>
              )}

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
                    disabled={startDisabled}
                    onClick={(e) => { e.stopPropagation(); handleStartService(activeProj.id, service.id); }}
                    className={`h-7 w-7 ${startDisabled ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-555 text-zinc-100'}`}
                    title={startDisabled ? "Docker is not running" : "Start Service"}
                  >
                    <Play className="h-3 w-3 fill-current" />
                  </Button>
                )}
                
                <div className="w-px h-4 bg-zinc-850 mx-1"></div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!dependencyStatuses[`${activeProj.id}_${service.id}`]}
                  onClick={(e) => { e.stopPropagation(); handleInstallDependencies(activeProj.id, service.id); }}
                  className={`h-7 w-7 transition-all ${
                    dependencyStatuses[`${activeProj.id}_${service.id}`]
                      ? 'text-emerald-100 bg-emerald-600/30 hover:bg-emerald-600/50 hover:text-emerald-50'
                      : 'text-red-400/50 bg-red-950/20 opacity-50 cursor-not-allowed'
                  }`}
                  title={dependencyStatuses[`${activeProj.id}_${service.id}`] ? `Install Dependencies (${dependencyStatuses[`${activeProj.id}_${service.id}`]})` : "No requirements file found"}
                >
                  <Package className="h-3 w-3" />
                </Button>
                

                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleEditClick(activeProj, e)}
                  className="h-7 w-7 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                  title="Edit Service"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDeleteServiceClick(activeProj.id, service.id, e)}
                  className="h-7 w-7 text-zinc-500 hover:text-destructive hover:bg-destructive/10"
                  title="Delete Service"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Git Integration Panel */}
      <div className="border-t border-zinc-900/60 pt-4">
        {/* Clickable header — always visible, shows summary when collapsed */}
        <button
          onClick={() => setShowGitPanel(v => !v)}
          className="w-full flex items-center justify-between mb-3 px-1 group"
        >
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-2 group-hover:text-zinc-300 transition-colors">
            <GitBranch className="h-4 w-4 text-primary" />
            <span>Git Integration</span>
          </h4>

          <div className="flex items-center space-x-2">
            {/* Summary badges — visible when collapsed OR always */}
            {gitSummary && !gitSummary.error && (
              <div className="flex items-center space-x-1.5">
                {/* Branch pill */}
                <span className="flex items-center space-x-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <GitBranch className="h-2.5 w-2.5 text-primary/70" />
                  <span className="max-w-[100px] truncate">{gitSummary.branch}</span>
                </span>

                {/* Changes badge */}
                {gitSummary.has_changes ? (
                  <span className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-950/40 border border-amber-900/30 text-amber-400">
                    <Circle className="h-2 w-2 fill-amber-400" />
                    <span>{gitSummary.changes.length}</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-950/30 border border-emerald-900/30 text-emerald-400">
                    <Check className="h-2.5 w-2.5" />
                    <span>Clean</span>
                  </span>
                )}

                {/* Ahead badge */}
                {gitSummary.ahead > 0 && (
                  <span className="flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-sky-950/40 border border-sky-900/30 text-sky-400">
                    <ArrowUp className="h-2.5 w-2.5" />
                    <span>{gitSummary.ahead}</span>
                  </span>
                )}

                {/* Behind badge */}
                {gitSummary.behind > 0 && (
                  <span className="flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-950/40 border border-amber-900/30 text-amber-400">
                    <ArrowDown className="h-2.5 w-2.5" />
                    <span>{gitSummary.behind}</span>
                  </span>
                )}
              </div>
            )}

            <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-all ${showGitPanel ? "" : "-rotate-90"}`} />
          </div>
        </button>

        <div className={`mb-4 ${showGitPanel ? "" : "hidden"}`}>
          <GitPanel
            projectId={activeProj.id}
            onInfoChange={(info) => {
              setGitSummary(info);
              onGitInfoChange?.(activeProj.id, info);
            }}
          />
        </div>
      </div>

      {/* Terminals Grid - Displaying all services concurrently */}
      <div className="flex flex-col border-t border-zinc-900/60 pt-4">
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
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pr-1">
          {projectServices.map((s) => {
            const status = statuses[`${activeProj.id}_${s.id}`] || "Idle";
            
            return (
              <LogConsole
                key={s.id}
                projectId={activeProj.id}
                serviceId={s.id}
                serviceName={s.name}
                status={status}
              />
            );
          })}
        </div>
      </div>

      <Dialog open={alertConfig.open} onOpenChange={(open) => setAlertConfig(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{alertConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300 py-2">
            {alertConfig.message}
          </div>
          <DialogFooter>
            <Button onClick={() => setAlertConfig(prev => ({ ...prev, open: false }))}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmConfig.open} onOpenChange={(open) => setConfirmConfig(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300 py-2">
            {confirmConfig.message}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmConfig(prev => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => {
              setConfirmConfig(prev => ({ ...prev, open: false }));
              confirmConfig.onConfirm();
            }}>
              Confirm Kill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editorDialogOpen} onOpenChange={setEditorDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Preferred Editor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {installedEditors.map((editor, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="justify-start text-left h-auto py-3 bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800/80"
                onClick={() => onSelectEditor(editor.path, editor.name)}
              >
                <div className="flex flex-col items-center w-full">
                  <span className="font-semibold text-zinc-200">{editor.name}</span>
                </div>
              </Button>
            ))}
            {installedEditors.length === 0 && (
              <div className="text-sm text-zinc-500 text-center py-4">
                No standard editors detected.
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between items-center w-full sm:justify-between">
            <Button variant="ghost" onClick={() => onSelectEditor("explorer", "Folder")} className="text-zinc-500 text-xs h-8">
              Reset to Explorer
            </Button>
            <Button variant="outline" onClick={onBrowseEditor}>
              Browse...
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
