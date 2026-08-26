import { redirect } from "next/navigation";

/** L'administration a été scindée en pages distinctes ; on redirige vers Membres. */
export default function AdminSettingsRedirect() {
  redirect("/settings/members");
}
