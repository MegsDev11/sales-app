import { cn } from "@/lib/utils";

/**
 * Page container.
 *
 * Deliberately keeps `space-y-*` rather than moving to flex+gap: the visual
 * result is identical but flex would turn every page's children into flex items
 * in one commit, changing min-height and alignment on anything with an internal
 * scroll area. It also stays width-unconstrained — adding a default max-width
 * would silently centre and narrow 50+ pages whose chart grids are sized for
 * full bleed.
 */
export function PageShell({
  children,
  className,
  dense = false,
}: {
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        dense
          ? "max-w-none space-y-4 p-3 lg:p-4"
          : "space-y-4 p-4 lg:space-y-5 lg:p-6 xl:p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Page header.
 *
 * The header used to be bare text on the grey field with a hairline under it,
 * which is why it read as detached from the page. It is now the first — and only
 * lifted — card in the stack: same radius, border, surface and `px-4` as every
 * Panel below it, so the h1, the panel titles and the table cells all start on
 * one uninterrupted left rail. Hierarchy comes from elevation and type size,
 * never from a second palette.
 *
 * Stays a single element so `cn()` overrides and `print:hidden` still land on
 * the outermost node — the QR label sheets depend on that.
 *
 * `eyebrow`, `meta` and `children` are additive, so existing call sites are
 * unaffected.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Small label above the title — module name, or a back-link on detail pages. */
  eyebrow?: React.ReactNode;
  /** Inline facts under the description: owner, status pill, last sync… */
  meta?: React.ReactNode;
  /** Bottom rail inside the card: tabs, filters, a date range. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-surface-elevated shadow-lift print:shadow-none",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 py-4 lg:py-5">
        <div className="min-w-0 flex-1 basis-[20rem]">
          {eyebrow ? (
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground">
              {/* Same mark as the active sidebar rail — ties nav to page. */}
              <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 truncate">{eyebrow}</span>
            </div>
          ) : null}

          <h1 className="text-balance text-[1.375rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground lg:text-[1.625rem]">
            {title}
          </h1>

          {description ? (
            <p className="mt-1.5 max-w-[68ch] text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}

          {meta ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] leading-5 text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 max-lg:w-full lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      {children ? (
        // The page's own grey echoed inside the card — this is what welds the
        // header to the canvas instead of floating it above.
        <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t border-hairline bg-muted/60 px-4 py-2.5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Panel({
  children,
  className,
  title,
  description,
  actions,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-surface-elevated shadow-panel print:shadow-none",
        className
      )}
    >
      {(title || actions) && (
        // px-4 is load-bearing: 29 `padded={false}` call sites hand-roll px-4
        // children to line up with this row. Panel and PageHeader share exactly
        // px-4, which is what produces the shared left rail.
        <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[13px] font-semibold leading-5 tracking-[-0.005em] text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      <div className={cn(padded && "p-4")}>{children}</div>
    </section>
  );
}

export function AlertBanner({
  children,
  tone = "warn",
  className,
}: {
  children: React.ReactNode;
  tone?: "warn" | "danger" | "info";
  className?: string;
}) {
  // Joins the card system rather than being a differently-shaped strip: same
  // radius, plus a 3px tone rail that rhymes with the sidebar's active bar and
  // the PageHeader eyebrow tick.
  const tones = {
    warn: "border-amber-200/80 bg-amber-50 text-amber-950 before:bg-amber-500",
    danger: "border-red-200/80 bg-red-50 text-red-900 before:bg-destructive",
    info: "border-slate-200 bg-slate-50 text-slate-800 before:bg-slate-400",
  };
  return (
    <div
      className={cn(
        "relative flex items-start gap-2.5 overflow-hidden rounded-lg border py-2.5 pl-4 pr-3.5 text-sm leading-relaxed",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  );
}

export function NavSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar print:hidden lg:block">
      <nav className="flex flex-col gap-0.5 p-3">{children}</nav>
    </aside>
  );
}

export function MobileNavShell({ children }: { children: React.ReactNode }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-sidebar-border bg-sidebar print:hidden lg:hidden">
      {children}
    </nav>
  );
}

export function navItemClass(active: boolean) {
  return cn(
    "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
    active
      ? "bg-accent text-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
      : "text-foreground/80 hover:bg-muted hover:text-foreground"
  );
}

export function mobileNavItemClass(active: boolean) {
  return cn(
    "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] sm:text-xs",
    active ? "text-primary" : "text-muted-foreground"
  );
}

/**
 * The count badge is deliberately the same whether its row is active or not — it
 * reports a number of things waiting, which does not change because you happen to
 * be standing on that page. It used to take an `active` flag and return the same
 * classes down both branches, which read as an unfinished decision rather than a
 * made one.
 */
export function navBadgeClass() {
  return "rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground";
}
