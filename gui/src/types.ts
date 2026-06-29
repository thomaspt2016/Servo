export interface EnvVar {
  key: string;
  value: string;
  override_value?: string;
  is_dynamic_port: boolean;
}

export interface Service {
  id: string;
  name: string;
  path: string;
  command: string;
  venv_path?: string;
  use_venv?: boolean;
  language?: string;
  description?: string;
  env_vars?: EnvVar[];
  mode?: "npm" | "custom" | "file";
}

export interface GitChange {
  file: string;
  type: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export interface GitCommit {
  hash: string;
  full_hash: string;
  message: string;
  author: string;
  time: string;
}

export interface GitInfo {
  branch: string;
  branches: string[];
  changes: GitChange[];
  has_changes: boolean;
  commits: GitCommit[];
  stashes: string[];
  remotes: Record<string, string>;
  ahead: number;
  behind: number;
  repo_root: string;
  error?: string;
}
export interface GitRepo {
  path: string;
  name: string;
  has_remote: boolean;
}

export interface Project {
  id: string;
  name: string;
  category: string;
  path?: string;
  description?: string;
  services: Service[];
  health_status?: 'active' | 'missing' | 'uninitialized' | 'corrupted';
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
  env_vars?: EnvVar[];
}

export interface FormState {
  id: string;
  name: string;
  description: string;
  category: string;
  path?: string;
  services: FormService[];
}

declare global {
  interface Window {
    pywebview?: {
      api: {
        load_projects(): Promise<Project[]>;
        save_project(project: Project): Promise<boolean>;
        delete_project(id: string): Promise<boolean>;
        import_project(): Promise<boolean>;
        read_env_file(filePath: string): Promise<Record<string, string>>;
        start_service(projectId: string, serviceId: string): Promise<boolean>;
        install_dependencies(projectId: string, serviceId: string): Promise<boolean>;
        start_raw_terminal(terminalId: string, cwd?: string | null): Promise<boolean>;
        stop_service(projectId: string, serviceId: string): Promise<boolean>;
        start_project(projectId: string): Promise<boolean>;
        stop_project(projectId: string): Promise<boolean>;
        get_statuses(): Promise<Record<string, string>>;
        get_dependency_statuses(): Promise<Record<string, string | null>>;
        check_port_conflict(port: number | string): Promise<{success: boolean, conflict?: boolean, message?: string, processes?: {pid: number, name: string}[]}>;
        resolve_port_conflict(port: number | string): Promise<{success: boolean, message: string, killed?: {pid: number, name: string}[]}>;
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
        resize_terminal(projectId: string, serviceId: string, cols: number, rows: number): Promise<boolean>;
        check_docker_status(): Promise<boolean>;
        get_docker_containers(): Promise<Record<string, {name: string, state: string}[]>>;
        stop_docker_container(containerName: string): Promise<boolean>;
        start_docker_container(containerName: string): Promise<boolean>;
        get_docker_container_logs(containerName: string): Promise<string>;
        warmup_service_terminal(projectId: string, serviceId: string): Promise<boolean>;
        git_get_repos(projectId: string): Promise<{ repos?: import("./types").GitRepo[]; error?: string }>;
        git_get_info(projectId: string, repoPath: string): Promise<import("./types").GitInfo>;
        git_checkout_branch(projectId: string, repoPath: string, branchName: string): Promise<{ success: boolean; message: string }>;
        git_stage_all(projectId: string, repoPath: string): Promise<{ success: boolean; message: string }>;
        git_stage_file(projectId: string, repoPath: string, filepath: string): Promise<{ success: boolean; message: string }>;
        git_unstage_file(projectId: string, repoPath: string, filepath: string): Promise<{ success: boolean; message: string }>;
        git_unstage_all(projectId: string, repoPath: string): Promise<{ success: boolean; message: string }>;
        git_commit(projectId: string, repoPath: string, message: string): Promise<{ success: boolean; message: string }>;
        git_push(projectId: string, repoPath: string, remote?: string, branch?: string): Promise<{ success: boolean; message: string }>;
      };
    };
    writeToTerminalUI?: (key: string, data: string) => void;
    __terminals?: Record<string, any>;
  }
}
