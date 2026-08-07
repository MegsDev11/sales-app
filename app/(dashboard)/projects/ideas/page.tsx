import { redirect } from "next/navigation";

/** The idea funnel is a view of /projects now. Kept so saved links still land. */
export default function ProjectIdeasRedirect() {
  redirect("/projects?view=funnel");
}
