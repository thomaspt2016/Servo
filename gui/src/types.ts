export interface Service {
  id: string;
  name: string;
  path: string;
  command: string;
  venv_path?: string;
  use_venv?: boolean;
  language?: string;
  description?: string;
  target_port?: string | number;
}

export interface Project {
  id: string;
  name: string;
  category: string;
  description?: string;
  services: Service[];
}

export interface FormService {
  id: string;
  name: string;
  description: string;
  path: string;
  command: string;
  venv_path: string;
  use_venv: boolean;
  language?: string;
  mode?: "file" | "npm" | "custom";
  target_port?: string | number;
}

export interface FormState {
  id: string;
  name: string;
  description: string;
  category: string;
  services: FormService[];
}

declare global {
  interface Window {
    pywebview?: {
      api: {
        load_projects(): Promise<Project[]>;
        save_project(project: Project): Promise<boolean>;
        delete_project(id: string): Promise<boolean>;
        start_service(projectId: string, serviceId: string): Promise<boolean>;
        install_dependencies(projectId: string, serviceId: string): Promise<boolean>;
        start_raw_terminal(terminalId: string, cwd?: string | null): Promise<boolean>;
        stop_service(projectId: string, serviceId: string): Promise<boolean>;
        start_project(projectId: string): Promise<boolean>;
        stop_project(projectId: string): Promise<boolean>;
        get_statuses(): Promise<Record<string, string>>;
        get_dependency_statuses(): Promise<Record<string, string | null>>;
        get_metrics(): Promise<Record<string, {cpu: number, memory: number}>>;
        get_active_ports(): Promise<Record<string, number>>;
        get_logs(projectId: string, serviceId: string): Promise<string[]>;
        clear_logs(projectId: string, serviceId: string): Promise<boolean>;
        pick_folder(default_dir?: string | null): Promise<string | null>;
        pick_file(default_dir?: string | null): Promise<string | null>;
        scan_folder_for_services(folder_path: string): Promise<Service[]>;
        get_npm_scripts(folder_path: string): Promise<string[]>;
        get_installed_languages(): Promise<string[]>;
        open_pip(): Promise<boolean>;
        close_pip(): Promise<boolean>;
        minimize_pip(): Promise<boolean>;
        resize_pip(width: number, height: number): Promise<boolean>;
        focus_main_window(): Promise<boolean>;
        get_pip_data(): Promise<{ projects: Project[]; statuses: Record<string, string> }>;
        write_to_service(projectId: string, serviceId: string, data: string): Promise<boolean>;
      };
    };
    writeToTerminalUI?: (key: string, data: string) => void;
    __terminals?: Record<string, any>;
  }
}
