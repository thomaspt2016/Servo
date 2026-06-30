import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Project } from "../types";
import { Settings, RefreshCw, Plus } from "lucide-react";

interface CommandPaletteProps {
  projects: Project[];
  handleSelectProject: (id: string | null) => void;
  fetchProjects: () => void;
  fetchStatuses: () => void;
  handleNewClick: () => void;
}

export function CommandPalette({ projects, handleSelectProject, fetchProjects, fetchStatuses, handleNewClick }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search projects..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Global Commands">
          <CommandItem onSelect={() => { setOpen(false); handleNewClick(); }}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Project</span>
          </CommandItem>
          <CommandItem onSelect={() => { setOpen(false); fetchProjects(); fetchStatuses(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>Refresh All Projects</span>
          </CommandItem>
        </CommandGroup>
        
        {projects.length > 0 && (
          <CommandGroup heading="Projects">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                onSelect={() => {
                  setOpen(false);
                  handleSelectProject(project.id);
                }}
              >
                <Settings className="mr-2 h-4 w-4 text-zinc-500" />
                <span>Open {project.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
