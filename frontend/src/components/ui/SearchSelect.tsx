import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";
import { controlClass } from "./Input";
import { cx } from "./cx";

export interface SearchOption {
  value: string;
  label: string;
}

interface SearchSelectProps {
  options: SearchOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  icon?: IconName;
  ariaLabel: string;
  /** Id for the trigger button, so a Field label can point at it. */
  id?: string;
  className?: string;
  /** Visually marks the trigger as the current selection (e.g. a tab group's active item). */
  highlighted?: boolean;
}

/**
 * Select with search over a static option list (client-side filter).
 * Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyText = "Tidak ditemukan",
  icon,
  ariaLabel,
  id: triggerId,
  className,
  highlighted,
}: SearchSelectProps) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, q]);
  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  const close = () => {
    setOpen(false);
    setQ("");
    triggerRef.current?.focus();
  };
  const pick = (o: SearchOption) => {
    onChange(o.value);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[active]) pick(list[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const current = options.find((o) => o.value === value);
  const activeId = open && list[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div className={cx("relative", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          controlClass,
          "flex cursor-pointer items-center gap-2 text-left",
          (open || highlighted) && "border-primary",
          highlighted && "bg-primary-soft!",
        )}
      >
        {icon && (
          <Icon name={icon} size={16} className={cx("shrink-0", highlighted ? "text-primary" : "text-muted")} />
        )}
        <span className={cx("min-w-0 flex-1 truncate", current ? "text-heading" : "text-muted")}>
          {current?.label ?? placeholder}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={cx("shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-full min-w-64 overflow-hidden rounded-md border border-line bg-white shadow-dropdown">
          <div className="relative border-b border-line p-2">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              aria-label={ariaLabel}
              autoComplete="off"
              className={cx(controlClass, "pl-9")}
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="m-0 max-h-72 list-none overflow-y-auto p-1">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">{emptyText}</li>}
            {list.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded px-3 py-2",
                    i === active && "bg-primary-soft",
                    selected && "font-medium text-primary-dark",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {selected && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-3 py-2 text-xs text-muted">
            {list.length} dari {options.length} pilihan
          </div>
        </div>
      )}
    </div>
  );
}
