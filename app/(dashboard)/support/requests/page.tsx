import { redirect } from "next/navigation";

/** Client ticket inbox removed — support uses Messages instead. */
export default function SupportRequestsRedirectPage() {
  redirect("/support/messages");
}
