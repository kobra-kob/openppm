import { redirect } from "next/navigation";

/** La sécurité du compte a déménagé dans Paramètres → Compte. */
export default function SecurityRedirect() {
  redirect("/settings/account");
}
