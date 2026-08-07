"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * A whole dropdown in one tag.
 *
 * Two things pushed this into existence.
 *
 * The app had grown TWO select implementations: 35 files used the Base UI
 * `Select` above, and 18 used a bare `<select>` with hand-copied Tailwind. The
 * native ones were 4px taller than the `Input` beside them, sat on the grey
 * canvas colour (`bg-background`) instead of the white every other control uses,
 * and had no focus ring — so half the forms in the product looked like a
 * different product.
 *
 * The 35 "good" ones weren't free either. Every one hand-wrote a
 * `<SelectValue>{(v) => LABELS[v]}</SelectValue>` mapper, because without one
 * the trigger prints the raw value (`on_hold` rather than "On hold"). That
 * mapper is unnecessary: `Select.Root` takes an `items` prop and derives the
 * label itself. Passing `options` here does that once for everybody.
 */

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldGroup {
  label: string;
  options: SelectFieldOption[];
}

function isGroup(x: SelectFieldOption | SelectFieldGroup): x is SelectFieldGroup {
  return Array.isArray((x as SelectFieldGroup).options);
}

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = "default",
  disabled,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  /** Controlled value. Use "" for "nothing chosen". */
  value: string;
  onValueChange: (value: string) => void;
  options: Array<SelectFieldOption | SelectFieldGroup>;
  placeholder?: string;
  /** Applied to the trigger. The trigger is `w-fit`; pass `w-full` inside forms. */
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const flat = React.useMemo(
    () => options.flatMap((o) => (isGroup(o) ? o.options : [o])),
    [options]
  );

  /**
   * Base UI treats "" as "nothing selected" and renders the placeholder, so an
   * option written as `{ value: "", label: "No template" }` — the direct
   * translation of `<option value="">No template</option>` — would never show its
   * own label. Promote that label to the placeholder so the wording the call site
   * chose is the wording on screen.
   */
  const emptyLabel = flat.find((o) => o.value === "")?.label;
  const resolvedPlaceholder = placeholder ?? emptyLabel ?? "Select…";

  /**
   * A value the list doesn't offer would otherwise render as the placeholder —
   * the field would look empty while holding real data, and saving the form
   * would quietly overwrite it. Show it instead, disabled, so it is visible and
   * cannot be re-picked once changed. This is what stops a department that was
   * renamed, or a manager who has left, from disappearing out of a record.
   */
  const hasOrphan = value !== "" && !flat.some((o) => o.value === value);

  const items = React.useMemo(
    () =>
      (hasOrphan ? [...flat, { value, label: value }] : flat).map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [flat, hasOrphan, value]
  );

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next == null ? "" : String(next))}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectTrigger
        size={size}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={className}
      >
        <SelectValue placeholder={resolvedPlaceholder} />
      </SelectTrigger>
      <SelectContent className={cn(flat.length > 12 && "max-h-72")}>
        {hasOrphan ? (
          <SelectItem value={value} disabled>
            {value}
          </SelectItem>
        ) : null}
        {options.map((entry, i) =>
          isGroup(entry) ? (
            <SelectGroup key={`${entry.label}-${i}`}>
              <SelectLabel>{entry.label}</SelectLabel>
              {entry.options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            <SelectItem key={entry.value} value={entry.value} disabled={entry.disabled}>
              {entry.label}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}
