
import { Layers, Plus, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Project, Service } from "../types";

export interface DashboardOverviewProps {
  projects: Project[];
  totalServicesCount: number;
  runningServicesCount: number;
  runningServices: { project: Project; service: Service }[];
  metrics?: Record<string, {cpu: number, memory: number}>;
  handleNewClick: () => void;
  fetchProjects: () => void;
  fetchStatuses: () => void;
  setActiveProjectId: (id: string | null) => void;
  handleStopService: (projectId: string, serviceId: string) => void;
}

export default function DashboardOverview({
  projects,
  totalServicesCount,
  runningServicesCount,
  runningServices,
  metrics,
  handleNewClick,
  fetchProjects,
  fetchStatuses,
  setActiveProjectId,
  handleStopService,
}: DashboardOverviewProps) {
  return (
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
                    {metrics && metrics[`${project.id}_${service.id}`] && (
                      <div className="flex items-center space-x-2 mr-2 ml-1 text-[10px] text-zinc-500 font-mono">
                        <span className={metrics[`${project.id}_${service.id}`].cpu > 80 ? "text-amber-500 font-bold" : "text-zinc-400"}>
                          {metrics[`${project.id}_${service.id}`].cpu}% CPU
                        </span>
                        <span className={metrics[`${project.id}_${service.id}`].memory > 1024 ? "text-amber-500 font-bold" : "text-zinc-400"}>
                          {metrics[`${project.id}_${service.id}`].memory}MB
                        </span>
                      </div>
                    )}
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
  );
}
