"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { ORG_WIDE_ROLES, ProjectView } from "@/features/projects/shared";
import { TasksSection } from "@/features/projects/tasks-section";

export default function ProjectTasksPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const currentUser = useAuthStore((state) => state.user);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectView>(`/projects/${id}`),
  });

  if (!project) {
    return null;
  }

  const canWork =
    (currentUser?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false) ||
    project.members.some(
      (member) => member.userId === currentUser?.id && member.role !== "observer",
    );

  return <TasksSection projectId={project.id} members={project.members} canWork={canWork} />;
}
