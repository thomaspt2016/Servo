import React, { useState } from "react";
import { Play, Square, Copy, Edit2, Trash2, Terminal, Package, Ban, ArrowLeft, GitBranch, ChevronDown, ArrowUp, ArrowDown, Check, Circle, AlertTriangle } from "lucide-react";
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


  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
      {/* Project Header Card */}
      <Card className="border-zinc-900 bg-zinc-950/40 relative shadow-sm">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center space-x-3 mb-1">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 -ml-1">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
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
                disabled={projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false}
                onClick={(e) => handleStartProject(activeProj.id, e)}
                className={`h-8 px-4 text-xs space-x-1.5 font-medium shadow-md ${projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' : 'bg-emerald-650 hover:bg-emerald-650 text-zinc-100 shadow-emerald-500/10'}`}
                title={projectServices.some(s => (s.language === "Docker Compose" || s.language === "Docker" || s.command.toLowerCase().includes("docker"))) && isDockerRunning === false ? "Docker is not running" : "Run Project"}
              >
                <Play className="h-3 w-3 fill-current" />
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
                
                {serviceStatus !== "Running" && service.target_port && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.pywebview && window.pywebview.api) {
                        try {
                           const check = await window.pywebview.api.check_port_conflict(service.target_port!);
                           if (!check.success) {
                             setAlertConfig({ open: true, title: "Check Failed", message: `Failed to check port: ${check.message}` });
                             return;
                           }
                           
                           if (!check.conflict) {
                             setAlertConfig({ open: true, title: "Port Free", message: `Port ${service.target_port} is currently free. No conflict found.` });
                             return;
                           }

                           const processList = check.processes ? check.processes.map(p => `${p.name} (PID: ${p.pid})`).join(', ') : 'Unknown process';
                           
                           setConfirmConfig({
                             open: true,
                             title: "Port Conflict Detected",
                             message: (
                               <div className="space-y-2">
                                 <p>Port {service.target_port} is currently in use by:</p>
                                 <pre className="p-2 bg-zinc-900 rounded text-xs overflow-auto">{processList}</pre>
                                 <p className="text-destructive font-semibold">Are you sure you want to forcibly kill these processes?</p>
                               </div>
                             ),
                             onConfirm: async () => {
                               try {
                                 const res = await window.pywebview!.api!.resolve_port_conflict(service.target_port!);
                                 if (res.success) {
                                   const killedStr = res.killed && res.killed.length > 0 ? res.killed.map((k: any) => `- ${k.name} (PID: ${k.pid})`).join('\n') : "";
                                   setAlertConfig({
                                     open: true,
                                     title: "Success",
                                     message: (
                                       <div className="space-y-2">
                                         <p>{res.message}</p>
                                         {killedStr && <pre className="p-2 bg-zinc-900 rounded text-xs">{killedStr}</pre>}
                                       </div>
                                     )
                                   });
                                 } else {
                                   setAlertConfig({ open: true, title: "Failed", message: `Failed: ${res.message}` });
                                 }
                               } catch (err: any) {
                                 setAlertConfig({ open: true, title: "Error", message: `Error: ${err}` });
                               }
                             }
                           });
                        } catch (err: any) {
                           setAlertConfig({ open: true, title: "Error", message: `Error: ${err}` });
                        }
                      }
                    }}
                    className="h-7 w-7 text-amber-500/80 hover:text-amber-400 hover:bg-amber-900/30"
                    title={`Resolve port conflict (Kill process on port ${service.target_port})`}
                  >
                    <Ban className="h-3 w-3" />
                  </Button>
                )}
                
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

    </div>
  );
}
