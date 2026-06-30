import React from "react";
import { Info, Wand2, Copy, Trash2, FolderOpen, FileCode, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FormState } from "../types";

export interface ProjectConfigDialogProps {
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  isEditMode: boolean;
  dialogError: string;
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  installedLanguages: string[];
  npmScripts: Record<string, string[]>;
  fetchNpmScripts: (serviceId: string, folderPath: string) => void;
  handleSave: (e: React.FormEvent) => void;
  handleAutoDetectServices: () => void;
  handleDuplicateServiceForm: (index: number) => void;
  handleRemoveServiceForm: (index: number) => void;
  handleBrowsePath: (index: number) => void;
  handleBrowseVenv: (index: number) => void;
  handleSetExecutionMode: (index: number, mode: "file" | "npm" | "custom") => void;
  handleBrowseCommandFile: (index: number) => void;
  handleAddServiceForm: () => void;
}

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

export default function ProjectConfigDialog({
  isDialogOpen,
  setIsDialogOpen,
  isEditMode,
  dialogError,
  formState,
  setFormState,
  installedLanguages,
  npmScripts,
  fetchNpmScripts,
  handleSave,
  handleAutoDetectServices,
  handleDuplicateServiceForm,
  handleRemoveServiceForm,
  handleBrowsePath,
  handleBrowseVenv,
  handleSetExecutionMode,
  handleBrowseCommandFile,
  handleAddServiceForm,
}: ProjectConfigDialogProps) {


  if (!isDialogOpen) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-black/40 backdrop-blur-xl text-zinc-200 transition-all duration-300">
      <div className="w-full max-w-[1400px] mx-auto animate-in fade-in zoom-in-95 duration-300 ease-out">
        <form onSubmit={handleSave} className="space-y-10">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-zinc-900/20 p-6 rounded-2xl border border-zinc-800/50 shadow-lg">
            <div>
              <h2 className="text-3xl font-extrabold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent tracking-tight">
                {isEditMode ? "Edit Project Configuration" : "New Project Configuration"}
              </h2>
              <p className="text-sm text-zinc-400 mt-2 font-medium">
                Configure your project stack. Run multiple backend/frontend services effortlessly in parallel.
              </p>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.2)] hover:shadow-[0_0_25px_rgba(var(--primary),0.4)] transition-all rounded-xl px-6 font-semibold">
                {isEditMode ? "Save Changes" : "Create Project"}
              </Button>
            </div>
          </div>

          {dialogError && (
            <div className="p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs flex items-center space-x-2">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>{dialogError}</span>
            </div>
          )}

          {/* General Project Config */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2">
            <div className="col-span-1 space-y-2">
              <label htmlFor="proj_name" className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Project Display Name
              </label>
              <Input
                id="proj_name"
                placeholder="e.g. Fullstack E-Commerce"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                className="h-11 bg-zinc-950/50 border-zinc-800/80 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
              />
            </div>
            <div className="col-span-1 md:col-span-2 space-y-2">
              <label htmlFor="proj_description" className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Project Description
              </label>
              <Input
                id="proj_description"
                placeholder="Short description of this project stack"
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                className="h-11 bg-zinc-950/50 border-zinc-800/80 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
              />
            </div>
          </div>

          {/* SERVICES SECTION */}
          <div className="pt-8">
            <div className="flex justify-between items-center mb-6 px-2">
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-zinc-100">Services Stack</h3>
                <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-full border border-zinc-700">
                  {formState.services.length} {formState.services.length === 1 ? 'Service' : 'Services'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoDetectServices}
                className="group flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 text-sm font-semibold rounded-xl text-primary transition-all border border-primary/20 shadow-sm hover:shadow-[0_0_15px_rgba(var(--primary),0.15)]"
              >
                <Wand2 className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                <span>Smart Auto-Detect</span>
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {formState.services.map((service, index) => (
                <div key={service.id} className="group p-6 border border-zinc-800/60 bg-gradient-to-br from-zinc-900/40 to-zinc-950/60 rounded-2xl relative space-y-5 shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 flex flex-col backdrop-blur-sm">
                  <div className="flex justify-between items-center pb-4 border-b border-zinc-800/50">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)] animate-pulse" />
                      <span className="text-sm font-bold text-zinc-100 tracking-wide uppercase">Service {index + 1}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleDuplicateServiceForm(index)}
                        className="text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 px-2.5 py-1.5 rounded-md flex items-center space-x-1.5 text-xs transition-colors border border-zinc-700/50"
                        title="Duplicate Service"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="font-medium">Duplicate</span>
                      </button>
                      {formState.services.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveServiceForm(index)}
                          className="text-zinc-400 hover:text-red-400 bg-zinc-800/50 hover:bg-red-500/10 hover:border-red-500/20 px-2.5 py-1.5 rounded-md flex items-center space-x-1.5 text-xs transition-colors border border-zinc-700/50"
                          title="Remove Service"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="font-medium">Remove</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Service Name */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400">
                        Service Name
                      </label>
                      <Input
                        placeholder="e.g. Frontend Web"
                        value={service.name}
                        onChange={(e) => {
                          const updated = [...formState.services];
                          updated[index].name = e.target.value;
                          setFormState({ ...formState, services: updated });
                        }}
                        className="h-10"
                      />
                    </div>

                    {/* Service Language selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400">
                        Language / Stack
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
                        className="h-10"
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

                    {/* Service Type Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400">
                        Type & Routing
                      </label>
                      <select
                        value={service.serviceType || 'background'}
                        onChange={(e) => {
                          const updated = [...formState.services];
                          updated[index].serviceType = e.target.value;
                          setFormState({ ...formState, services: updated });
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-300 h-10 px-3 focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                      >
                        <option value="frontend">Web Frontend (Routes to /)</option>
                        <option value="backend">API Backend (Routes to /api/*)</option>
                        <option value="background">Background Worker</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Service Description */}
                    <div className="space-y-1.5 col-span-2 md:col-span-1">
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
                          <div className="flex items-center space-x-2">
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
                            <div className="relative group/tooltip flex items-center justify-center">
                              <Info className="h-5 w-5 text-zinc-500 hover:text-primary transition-colors cursor-help" />
                              <div className="absolute bottom-full mb-2 right-0 w-[460px] p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 text-xs text-zinc-300">
                                <p className="font-semibold text-zinc-100 mb-2 text-[13px]">Command Configuration Guide</p>
                                
                                <div className="mb-3 space-y-2 text-[11px] text-zinc-400 font-sans leading-relaxed">
                                  <p><strong className="text-primary font-semibold">Web Apps (Browser):</strong> Use <code className="text-primary bg-primary/10 px-1 py-0.5 rounded font-mono">{"{port}"}</code> to let Servo assign dynamic ports and automatically bridge your Frontend & Backend via the Caddy reverse proxy (No CORS!).</p>
                                  <p><strong className="text-zinc-200 font-semibold">Desktop Apps (PyWebView/Electron):</strong> Do <strong className="text-white uppercase text-[10px] bg-red-500/30 px-1 py-0.5 rounded font-bold">not</strong> use <code className="text-zinc-300 font-mono">{"{port}"}</code>! Hardcode a static port (e.g. <code className="font-mono bg-zinc-800 px-1 py-0.5 rounded">--port 5173</code>) in both your UI and Backend commands so your desktop window knows exactly where to load the UI.</p>
                                </div>

                                <p className="font-semibold text-zinc-300 mb-2 border-t border-zinc-800/80 pt-3">Common Command Examples:</p>
                                <ul className="space-y-2 font-mono text-[10px]">
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Node.js (Vite / React / Vue):</span>
                                    <span className="text-emerald-400">npm run dev -- --port {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (FastAPI / Uvicorn):</span>
                                    <span className="text-emerald-400">uvicorn main:app --port {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (Django):</span>
                                    <span className="text-emerald-400">python manage.py runserver {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (Flask):</span>
                                    <span className="text-emerald-400">flask run -p {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Docker Container:</span>
                                    <span className="text-emerald-400">docker run -p {"{port}"}:8000 my-awesome-image</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Docker Compose (Windows):</span>
                                    <span className="text-emerald-400">$env:PORT={"{"}port{"}"}; docker-compose up</span>
                                  </li>
                                  <li className="pt-2 mt-1 border-t border-zinc-800/80">
                                    <span className="text-zinc-500 block font-sans">• Background Task (No proxy needed):</span>
                                    <span className="text-emerald-400">celery worker -A tasks <span className="text-zinc-500 font-sans italic">(Just don't use {"{port}"}!)</span></span>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Execution Preview Panel */}
                        {service.command && (
                          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl font-mono text-[10px] space-y-2 shadow-inner">
                            <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-zinc-500">
                              <span>Active Execution Command:</span>
                              <span className="text-zinc-650 font-normal capitalize">{(service.mode || "npm")} mode</span>
                            </div>
                            <code className="text-emerald-400 block break-all font-mono text-[11px]">
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
                          <div className="flex items-center space-x-2">
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
                            <div className="relative group/tooltip flex items-center justify-center">
                              <Info className="h-5 w-5 text-zinc-500 hover:text-primary transition-colors cursor-help" />
                              <div className="absolute bottom-full mb-2 right-0 w-[460px] p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 text-xs text-zinc-300">
                                <p className="font-semibold text-zinc-100 mb-2 text-[13px]">Command Configuration Guide</p>
                                
                                <div className="mb-3 space-y-2 text-[11px] text-zinc-400 font-sans leading-relaxed">
                                  <p><strong className="text-primary font-semibold">Web Apps (Browser):</strong> Use <code className="text-primary bg-primary/10 px-1 py-0.5 rounded font-mono">{"{port}"}</code> to let Servo assign dynamic ports and automatically bridge your Frontend & Backend via the Caddy reverse proxy (No CORS!).</p>
                                  <p><strong className="text-zinc-200 font-semibold">Desktop Apps (PyWebView/Electron):</strong> Do <strong className="text-white uppercase text-[10px] bg-red-500/30 px-1 py-0.5 rounded font-bold">not</strong> use <code className="text-zinc-300 font-mono">{"{port}"}</code>! Hardcode a static port (e.g. <code className="font-mono bg-zinc-800 px-1 py-0.5 rounded">--port 5173</code>) in both your UI and Backend commands so your desktop window knows exactly where to load the UI.</p>
                                </div>

                                <p className="font-semibold text-zinc-300 mb-2 border-t border-zinc-800/80 pt-3">Common Command Examples:</p>
                                <ul className="space-y-2 font-mono text-[10px]">
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Node.js (Vite / React / Vue):</span>
                                    <span className="text-emerald-400">npm run dev -- --port {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (FastAPI / Uvicorn):</span>
                                    <span className="text-emerald-400">uvicorn main:app --port {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (Django):</span>
                                    <span className="text-emerald-400">python manage.py runserver {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Python (Flask):</span>
                                    <span className="text-emerald-400">flask run -p {"{port}"}</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Docker Container:</span>
                                    <span className="text-emerald-400">docker run -p {"{port}"}:8000 my-awesome-image</span>
                                  </li>
                                  <li>
                                    <span className="text-zinc-500 block font-sans">• Docker Compose (Windows):</span>
                                    <span className="text-emerald-400">$env:PORT={"{"}port{"}"}; docker-compose up</span>
                                  </li>
                                  <li className="pt-2 mt-1 border-t border-zinc-800/80">
                                    <span className="text-zinc-500 block font-sans">• Background Task (No proxy needed):</span>
                                    <span className="text-emerald-400">celery worker -A tasks <span className="text-zinc-500 font-sans italic">(Just don't use {"{port}"}!)</span></span>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Execution Preview Panel */}
                        {service.command && (
                          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl font-mono text-[10px] space-y-2 shadow-inner">
                            <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-zinc-500">
                              <span>Active Execution Command:</span>
                              <span className="text-zinc-650 font-normal capitalize">{(service.mode || "file")} mode</span>
                            </div>
                            <code className="text-emerald-400 block break-all font-mono text-[11px]">
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
              <div className="col-span-1 xl:col-span-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddServiceForm}
                  className="w-full border-zinc-800/80 border-dashed hover:border-primary/50 text-zinc-400 hover:text-primary h-16 flex items-center justify-center space-x-2 bg-zinc-950/20 hover:bg-primary/5 rounded-2xl transition-all duration-300 group shadow-sm hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]"
                >
                  <Plus className="h-5 w-5 group-hover:scale-125 transition-transform duration-300" />
                  <span className="font-semibold text-sm">Add Another Service</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-8 pb-4 border-t border-zinc-800/50 mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-xl px-6"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--primary),0.2)] rounded-xl px-8 font-bold"
              onClick={(e) => { e.stopPropagation(); }}
            >
              {isEditMode ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
