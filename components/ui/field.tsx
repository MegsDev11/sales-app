import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A labelled form row.
 *
 * The same label was being written four different ways across the product —
 * `mb-1 block text-xs font-medium text-muted-foreground` (40 times),
 * `text-xs font-medium text-muted-foreground` (35), the same again in
 * `text-foreground` (27) and `mb-1 block text-sm font-medium` (16). So the same
 * field caption is grey in one dialog and near-black in the next, and 12px in
 * one and 14px in another. None of that was a decision; it is what happens when
 * a class string is copied instead of a component.
 *
 * `htmlFor` is worth passing: without it the caption is decoration, and clicking
 * it does not focus the control.
 */

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "mb-1 block text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("mt-1 text-[11px] leading-snug text-muted-foreground", className)} {...props} />
  );
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn("mt-1 text-[11px] leading-snug text-destructive", className)}
      {...props}
    />
  );
}

/**
 * With `htmlFor` this is a `<div>` holding a `<label for=…>`; without it the whole
 * row IS the `<label>`, so the control inside is still associated. Both shapes were
 * already in use — three files had grown their own `Field` — and supporting both
 * means a call site can adopt this without inventing an id for every input.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  /** Shown under the control. Suppressed while `error` is set. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      {label ? (
        htmlFor ? (
          <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        ) : (
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {label}
          </span>
        )
      ) : null}
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </>
  );

  if (htmlFor) return <div className={cn("min-w-0", className)}>{body}</div>;
  return <label className={cn("block min-w-0", className)}>{body}</label>;
}
