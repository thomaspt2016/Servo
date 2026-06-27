import React from "react";
import { Play, Square, Copy, Edit2, Trash2, Terminal, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogConsole } from "./LogConsole";
import type { Project } from "../types";

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
}: ProjectWorkspaceProps) {
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
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
