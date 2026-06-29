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
  const handleLoadEnvFile = async (index: number) => {
    // Default to the project path or first service path or empty
    const defaultDir = formState.path || formState.services[0]?.path || null;
    
    if (window.pywebview?.api) {
      try {
        const filePath = await window.pywebview.api.pick_file(defaultDir);
        if (!filePath) return; // User cancelled
        
        const envs = await window.pywebview.api.read_env_file(filePath);
        const updated = [...formState.services];
        const existingVars = updated[index].env_vars || [];
        const existingKeys = new Set(existingVars.map(v => v.key));
        
        for (const [k, v] of Object.entries(envs)) {
          if (!existingKeys.has(k)) {
            existingVars.push({ key: k, value: v as string, is_dynamic_port: false });
          }
        }
        updated[index].env_vars = existingVars;
        setFormState({ ...formState, services: updated });
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (!isDialogOpen) return null;

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-zinc-950/20 text-zinc-200">
      <div className="w-full max-w-[1400px] mx-auto">
        <form onSubmit={handleSave} className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{isEditMode ? "Edit Project Configuration" : "Add Project Configuration"}</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Configure the project stack. You can run multiple backend/frontend services in parallel.
              </p>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
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
            </div>
          </div>

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
          <div className="border-t border-zinc-900/60 pt-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-zinc-300">Services Stack ({formState.services.length})</h3>
              <button
                type="button"
                onClick={handleAutoDetectServices}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-xs font-semibold rounded-lg text-primary transition-colors border border-primary/20"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>Smart Import (Auto-detect)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2">
              {formState.services.map((service, index) => (
                <div key={service.id} className="p-5 border border-zinc-900 bg-zinc-950/40 rounded-xl relative space-y-4 shadow-sm flex flex-col">
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
                  
                  {/* Environment Variables - Shared across all layouts */}
                  <div className="pt-4 mt-4 border-t border-zinc-900/60 space-y-3 px-5 pb-5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-zinc-400">
                        Runtime Environment Overrides
                      </label>
                      <div className="flex space-x-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleLoadEnvFile(index)}
                          className="h-6 text-[10px] px-2 text-primary hover:text-primary/80 hover:bg-transparent"
                        >
                          Load .env File
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const updated = [...formState.services];
                            updated[index].env_vars = [...(updated[index].env_vars || []), { key: "", value: "", is_dynamic_port: false }];
                            setFormState({ ...formState, services: updated });
                          }}
                          className="h-6 text-[10px] px-2 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        >
                          + Add Var
                        </Button>
                      </div>
                    </div>

                    {(service.env_vars || []).length > 0 && (
                      <div className="space-y-2">
                        {service.env_vars!.map((envVar, envIndex) => (
                          <div key={envIndex} className="flex flex-col md:flex-row md:items-center gap-2 border border-zinc-900/40 p-2 rounded-lg bg-zinc-950/20">
                            <div className="flex-1 flex gap-2">
                              <Input
                                placeholder="Key (e.g. PORT)"
                                value={envVar.key}
                                onChange={(e) => {
                                  const updated = [...formState.services];
                                  updated[index].env_vars![envIndex].key = e.target.value;
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="w-1/3 h-8 text-[11px] bg-zinc-950"
                              />
                              <Input
                                placeholder="Default Value"
                                value={envVar.value}
                                disabled={true}
                                className="w-1/3 h-8 text-[11px] text-zinc-500 bg-zinc-900/50"
                                title="Original value from .env file"
                              />
                              <Input
                                placeholder="Runtime Override Value"
                                value={envVar.is_dynamic_port ? "<Auto-Assigned Port>" : (envVar.override_value || "")}
                                disabled={envVar.is_dynamic_port}
                                onChange={(e) => {
                                  const updated = [...formState.services];
                                  updated[index].env_vars![envIndex].override_value = e.target.value;
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="flex-1 h-8 text-[11px] bg-zinc-950 border-primary/30"
                                title="Value to inject at runtime"
                              />
                            </div>
                            <div className="flex items-center space-x-2 pl-1">
                              <div className="flex items-center space-x-1 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  id={`dyn_${index}_${envIndex}`}
                                  checked={envVar.is_dynamic_port}
                                  onChange={(e) => {
                                    const updated = [...formState.services];
                                    updated[index].env_vars![envIndex].is_dynamic_port = e.target.checked;
                                    setFormState({ ...formState, services: updated });
                                  }}
                                  className="rounded bg-zinc-950 border-zinc-800 text-primary h-3.5 w-3.5 focus:ring-0"
                                />
                                <label htmlFor={`dyn_${index}_${envIndex}`} className="text-[10px] text-zinc-400 cursor-pointer">
                                  Dyn. Port
                                </label>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  const updated = [...formState.services];
                                  updated[index].env_vars!.splice(envIndex, 1);
                                  setFormState({ ...formState, services: updated });
                                }}
                                className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 flex-shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Add Service Button at the bottom of the list */}
              <div className="col-span-1 xl:col-span-2 pt-2">
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

          <div className="flex justify-end space-x-2 pt-6 border-t border-zinc-900 mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-primary text-zinc-100 hover:bg-primary/90"
              onClick={(e) => { e.stopPropagation(); }}
            >
              {isEditMode ? "Update Project" : "Add Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
