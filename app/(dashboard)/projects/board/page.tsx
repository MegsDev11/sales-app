import { redirect } from "next/navigation";

/** The board is a view of /projects now. Kept so saved links still land. */
export default function ProjectBoardRedirect() {
  redirect("/projects?view=board");
}
