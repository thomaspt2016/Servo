import React from "react";
import { Layers, Plus, FolderDown, Search, X, RefreshCw, Edit2, Trash2, GitBranch, ArrowUp, ArrowDown, Check, Circle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project, GitInfo } from "../types";

export interface SidebarProps {
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredProjects: Project[];
  loading: boolean;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  statuses: Record<string, string>;
  gitInfoMap: Record<string, GitInfo>;
  handleNewClick: () => void;
  handleEditClick: (project: Project, e: React.MouseEvent) => void;
  handleDeleteClick: (id: string, e: React.MouseEvent) => void;
  handleImportClick?: () => void;
  isDockerRunning: boolean;
}

export default function Sidebar({
  categories,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  filteredProjects,
  loading,
  activeProjectId,
  setActiveProjectId,
  statuses,
  gitInfoMap,
  handleNewClick,
  handleEditClick,
  handleDeleteClick,
  handleImportClick,
  isDockerRunning,
}: SidebarProps) {
  return (
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
        <div className="flex gap-2 mb-4">
          <Button onClick={handleNewClick} className="flex-1 justify-center space-x-2 bg-primary/90 text-zinc-100 hover:bg-primary shadow-lg shadow-primary/10">
            <Plus className="h-4 w-4" />
            <span>New</span>
          </Button>
          <Button onClick={handleImportClick} variant="outline" className="flex-1 justify-center space-x-2 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 shadow-lg">
            <FolderDown className="h-4 w-4" />
            <span>Import</span>
          </Button>
        </div>

        {/* Navigation Categories */}
        <div className="mb-4">
          <span className="text-[10px] font-bold text-zinc-650 uppercase tracking-wider block mb-2 px-1">
            Category filter
          </span>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const isDockerRelated = cat.toLowerCase().includes("docker");
              const showWarning = isDockerRelated && !isDockerRunning;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center px-2.5 py-1 text-[11px] rounded-md transition-all border ${
                    selectedCategory === cat
                      ? "bg-primary/20 text-primary border-primary/40 font-medium"
                      : "bg-zinc-950/40 text-zinc-500 border-zinc-900 hover:text-zinc-300 hover:bg-zinc-900/40"
                  }`}
                  title={showWarning ? "Docker is not running" : ""}
                >
                  <span>{cat}</span>
                  {showWarning && <AlertTriangle className="h-3 w-3 ml-1.5 text-red-500/80" />}
                </button>
              );
            })}
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
              
              const isHealthy = !project.health_status || project.health_status === 'active';
              
              let statusColor = "bg-zinc-700";
              if (!isHealthy) statusColor = "bg-amber-500";
              else if (errorCount > 0) statusColor = "bg-destructive animate-pulse";
              else if (runningCount > 0) statusColor = "bg-emerald-500 animate-pulse";

              return (
                <div
                  key={project.id}
                  onClick={() => {
                    setActiveProjectId(project.id);
                  }}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 group relative flex flex-col gap-2 overflow-hidden ${
                    isActive
                      ? "bg-zinc-900/80 border-primary/50 shadow-md shadow-primary/5 text-zinc-100"
                      : "bg-zinc-950/40 border-zinc-900 hover:bg-zinc-900/50 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  } ${!isHealthy ? "opacity-50 grayscale" : ""}`}
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="flex flex-col flex-1 truncate pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold truncate text-zinc-200">
                          {project.name}
                        </span>
                        {project.health_status === 'missing' && (
                          <span title="Directory missing">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500/80" />
                          </span>
                        )}
                        {project.health_status === 'uninitialized' && (
                          <span title="Missing .servo.json">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500/80" />
                          </span>
                        )}
                        {project.health_status === 'corrupted' && (
                          <span title="Invalid .servo.json syntax">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-red-500/80" />
                          </span>
                        )}
                        {services.some(s => s.language?.toLowerCase().includes("docker") || s.command.toLowerCase().includes("docker")) && !isDockerRunning && (
                          <span title="Docker is not running">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-red-500/80" />
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {project.category || "Uncategorized"}
                      </span>
                    </div>
                    
                    {/* Status / Actions Container */}
                    <div className="flex items-center justify-end min-w-[40px] h-6 relative">
                      {/* Status Dot */}
                      <div className={`h-2.5 w-2.5 rounded-full ${statusColor} transition-all duration-300 absolute right-1 group-hover:opacity-0 group-hover:scale-50`} />
                      
                      {/* Actions */}
                      <div className="absolute right-0 flex items-center space-x-0.5 opacity-0 scale-95 translate-x-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 transition-all duration-300">
                        <button
                          onClick={(e) => handleEditClick(project, e)}
                          className="p-1.5 text-zinc-500 hover:text-primary hover:bg-primary/15 rounded-md transition-all"
                          title="Edit Project"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(project.id, e)}
                          className="p-1.5 text-zinc-500 hover:text-destructive hover:bg-destructive/15 rounded-md transition-all"
                          title="Delete Project"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Git stats row */}
                  {gitInfoMap[project.id] && (
                    <div className="flex items-center space-x-1.5 pt-1.5 border-t border-zinc-900/50 group-hover:border-zinc-800/80 transition-colors">
                      {/* Branch */}
                      <span className="flex items-center space-x-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800/60 text-zinc-400 max-w-[90px] truncate">
                        <GitBranch className="h-2 w-2 text-primary/60 flex-shrink-0" />
                        <span className="truncate">{gitInfoMap[project.id].branch}</span>
                      </span>

                      {/* Changes or clean */}
                      {gitInfoMap[project.id].has_changes ? (
                        <span className="flex items-center space-x-0.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-900/30 text-amber-400">
                          <Circle className="h-1.5 w-1.5 fill-amber-400" />
                          <span>{gitInfoMap[project.id].changes.length}</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-0.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/30 border border-emerald-900/30 text-emerald-400">
                          <Check className="h-2 w-2" />
                        </span>
                      )}

                      {/* Ahead */}
                      {gitInfoMap[project.id].ahead > 0 && (
                        <span className="flex items-center space-x-0.5 text-[9px] px-1 py-0.5 rounded bg-sky-950/40 border border-sky-900/30 text-sky-400">
                          <ArrowUp className="h-2 w-2" />
                          <span>{gitInfoMap[project.id].ahead}</span>
                        </span>
                      )}

                      {/* Behind */}
                      {gitInfoMap[project.id].behind > 0 && (
                        <span className="flex items-center space-x-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-950/40 border border-amber-900/30 text-amber-400">
                          <ArrowDown className="h-2 w-2" />
                          <span>{gitInfoMap[project.id].behind}</span>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[9px] font-medium pt-2.5 border-t border-zinc-900/50 group-hover:border-zinc-800/80 transition-colors">
                    <div className="flex items-center space-x-1.5 truncate pr-2">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 truncate">
                         {Array.from(new Set(services.map(s => s.language || "Python"))).join(", ")}
                      </span>
                    </div>
                    <span className={`whitespace-nowrap ${runningCount > 0 ? "text-emerald-500/90" : "text-zinc-600"}`}>
                      {runningCount}/{services.length} active
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
