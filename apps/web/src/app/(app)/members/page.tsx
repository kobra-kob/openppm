import { redirect } from "next/navigation";

/** La gestion des membres a déménagé dans Paramètres → Administration. */
export default function MembersRedirect() {
  redirect("/settings/members");
}
