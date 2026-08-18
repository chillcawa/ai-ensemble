import { invoke } from "@tauri-apps/api/core";
import type { Project } from "./types";

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

export async function createProject(id: string, name: string, description = ""): Promise<Project> {
  return invoke<Project>("create_project", { id, name, description });
}

export async function renameProject(projectId: string, name: string): Promise<Project> {
  return invoke<Project>("rename_project", { projectId, name });
}

export async function deleteProject(projectId: string): Promise<void> {
  await invoke("delete_project", { projectId });
}
