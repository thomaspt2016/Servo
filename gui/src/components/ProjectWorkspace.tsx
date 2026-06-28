import React, { useState } from "react";
import { Play, Square, Copy, Edit2, Trash2, Terminal, Package, Ban, ArrowLeft, GitBranch, ChevronDown, ArrowUp, ArrowDown, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogConsole } from "./LogConsole";
import { GitPanel } from "./GitPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Project, GitInfo } from "../types";

export interface ProjectWorkspaceProps {
  activeProj: Project;
  statuses: Record<string, string>;
  dependencyStatuses: Record<string, string | null>;
  activePorts: Record<string, number>;
  metrics?: Record<string, {cpu: number, memory: number}>;
  projectLogs: Record<string, string[]>;
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
  metrics,
  projectLogs,
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

  const [showGitPanel, setShowGitPanel] = useState(false);
  const [gitSummary, setGitSummary] = useState<GitInfo | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ open: boolean, title: string, message: React.ReactNode }>({ open: false, title: "", message: "" });
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean, title: string, message: React.ReactNode, onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });


  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
      {/* Project Header Card */}
      <Card className="border-zinc-900 bg-zinc-950/40 relative shadow-sm">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 pr-4 truncate flex-1">
            <div className="flex items-center space-x-3">
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
                    {serviceStatus === "Running" && activePorts[serviceKey] && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 rounded flex items-center shadow-sm">
                        📍 :{activePorts[serviceKey]}
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
                    onClick={(e) => { e.stopPropagation(); handleStartService(activeProj.id, service.id); }}
                    className="h-7 w-7 bg-emerald-600 hover:bg-emerald-555 text-zinc-100"
                    title="Start Service"
                  >
                    <Play className="h-3 w-3 fill-zinc-150" />
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
            const logs = projectLogs[s.id] || [];
            
            return (
              <LogConsole
                key={s.id}
                projectId={activeProj.id}
                serviceId={s.id}
                serviceName={s.name}
                logs={logs}
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
