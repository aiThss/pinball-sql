"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import styles from "./StatusSelect.module.css";

export interface StatusSelectOption {
  value: string;
  label: string;
}

interface StatusSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[] | readonly StatusSelectOption[];
  allOptionLabel?: string;
  ariaLabel?: string;
  size?: "md" | "lg";
  className?: string;
  disabled?: boolean;
}

function getStatusDotClass(value: string): string {
  switch (value) {
    case "Đang gửi":
      return styles.dotActive;
    case "Đã nhận lại":
      return styles.dotReturned;
    case "Đã đổi quà":
      return styles.dotGift;
    case "Đã hủy":
      return styles.dotCancelled;
    default:
      return styles.dotAll;
  }
}

export default function StatusSelect({
  value,
  onChange,
  options,
  allOptionLabel,
  ariaLabel = "Trạng thái",
  size = "md",
  className = "",
  disabled = false,
}: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [openUp, setOpenUp] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const normalizedOptions = useMemo<StatusSelectOption[]>(() => {
    const items = options.map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt,
    );
    if (allOptionLabel) {
      return [{ value: "", label: allOptionLabel }, ...items];
    }
    return items;
  }, [allOptionLabel, options]);

  const selectedOption = useMemo(() => {
    return (
      normalizedOptions.find((opt) => opt.value === value) ||
      normalizedOptions[0] || { value: "", label: "" }
    );
  }, [normalizedOptions, value]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = normalizedOptions.length * 47 + 16;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    setOpenUp(shouldOpenUp);
    setThemeMode(
      trigger.closest('[data-staff-theme]')?.getAttribute("data-staff-theme") === "dark"
        ? "dark"
        : "light",
    );

    if (shouldOpenUp) {
      setMenuStyle({
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        bottom: `${Math.max(8, window.innerHeight - rect.top + 6)}px`,
        top: "auto",
      });
    } else {
      setMenuStyle({
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        top: `${rect.bottom + 6}px`,
        bottom: "auto",
      });
    }
  }, [normalizedOptions.length]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePosition]);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      updatePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className={`${styles.root} ${className}`}>
      <button
        ref={triggerRef}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`${styles.trigger} ${size === "lg" ? styles.triggerTall : ""} ${
          open ? styles.triggerOpen : ""
        }`}
        disabled={disabled}
        onClick={handleToggle}
        type="button"
      >
        <span className={styles.triggerContent}>
          <span aria-hidden="true" className={`${styles.dot} ${getStatusDotClass(selectedOption.value)}`} />
          <span className={styles.triggerLabel}>{selectedOption.label}</span>
        </span>
        <ChevronDown aria-hidden="true" className={styles.chevron} size={17} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              aria-label={ariaLabel}
              className={`${styles.menu} ${openUp ? styles.menuUp : ""}`}
              data-theme={themeMode}
              id={listboxId}
              role="listbox"
              style={menuStyle}
            >
              {normalizedOptions.map((option) => {
                const isSelected = option.value === selectedOption.value;
                return (
                  <button
                    key={option.value || "__all__"}
                    aria-selected={isSelected}
                    className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                    onClick={() => handleSelect(option.value)}
                    role="option"
                    type="button"
                  >
                    <span className={styles.optionLeft}>
                      <span aria-hidden="true" className={`${styles.dot} ${getStatusDotClass(option.value)}`} />
                      <span>{option.label}</span>
                    </span>
                    {isSelected ? (
                      <span aria-hidden="true" className={styles.checkBadge}>
                        <Check size={13} strokeWidth={2.75} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
