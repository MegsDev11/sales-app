import { cn } from "@/lib/utils";

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
        "mx-auto w-full space-y-5",
        dense ? "max-w-none space-y-4 p-3 lg:p-4" : "p-4 lg:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
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
        "rounded-lg border border-border bg-surface-elevated shadow-sm",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
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
  const tones = {
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-900",
    info: "border-slate-200 bg-slate-50 text-slate-800",
  };
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm",
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

export function navBadgeClass(active: boolean) {
  return cn(
    "rounded-full px-1.5 text-[10px] font-bold",
    active ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"
  );
}
