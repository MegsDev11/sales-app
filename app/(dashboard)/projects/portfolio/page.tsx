import { redirect } from "next/navigation";

/**
 * The portfolio table is a view of /projects now, not a page of its own.
 *
 * Kept as a redirect rather than deleted: this route was in the sidebar and in
 * people's bookmarks, and a 404 on a link someone saved is a worse outcome than one
 * file that does nothing but point at the right place.
 */
export default function ProjectPortfolioRedirect() {
  redirect("/projects?view=table");
}
