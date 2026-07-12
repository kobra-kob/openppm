import { redirect } from "next/navigation";

/** L'ancienne liste vit désormais sur l'accueil (Project Workspace). */
export default function ProjectsRedirect() {
  redirect("/");
}
