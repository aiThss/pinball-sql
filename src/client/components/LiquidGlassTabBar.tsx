import { useRef, useState, type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { AppLink, useAppRouter } from "../lib/router";
import styles from "./LiquidGlass.module.css";

export interface LiquidGlassTabItem {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "blue" | "green" | "orange" | "neutral";
}

export interface LiquidGlassTabBarProps {
  items: LiquidGlassTabItem[];
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  theme?: "light" | "dark";
}

export default function LiquidGlassTabBar({
  items,
  activeId,
  defaultActiveId,
  onActiveChange,
  ariaLabel = "Thanh điều hướng",
  className = "",
  theme = "light",
}: LiquidGlassTabBarProps) {
  const router = useAppRouter();
  const [internalActiveId, setInternalActiveId] = useState<string>(
    activeId ?? defaultActiveId ?? items[0]?.id ?? ""
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef(0);
  const touchLastXRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);

  const resolvedActiveId = activeId ?? internalActiveId;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === resolvedActiveId)
  );
  const displayedIndex = previewIndex ?? activeIndex;
  const activeTone = items[displayedIndex]?.tone ?? "blue";

  const getIndexFromClientX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || items.length === 0) return activeIndex;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return activeIndex;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(items.length - 1, Math.max(0, Math.floor(ratio * items.length)));
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchLastXRef.current = touch.clientX;
    const idx = getIndexFromClientX(touch.clientX);
    previewIndexRef.current = idx;
    setPreviewIndex(idx);
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchLastXRef.current = touch.clientX;
    const idx = getIndexFromClientX(touch.clientX);
    previewIndexRef.current = idx;
    setPreviewIndex(idx);
  };

  const handleTouchEnd = () => {
    const draggedDistance = Math.abs(touchLastXRef.current - touchStartXRef.current);
    const targetIdx = previewIndexRef.current;
    previewIndexRef.current = null;
    setPreviewIndex(null);

    if (draggedDistance > 16 && targetIdx !== null && items[targetIdx]) {
      const selected = items[targetIdx];
      setInternalActiveId(selected.id);
      onActiveChange?.(selected.id);
      if (selected.onClick) {
        selected.onClick();
      } else if (selected.href) {
        router.push(selected.href);
      }
    }
  };

  const handleItemActivate = (item: LiquidGlassTabItem) => {
    setInternalActiveId(item.id);
    previewIndexRef.current = null;
    setPreviewIndex(null);
    onActiveChange?.(item.id);
    item.onClick?.();
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={`${styles.tabBarRoot} ${className}`}
      data-liquid-theme={theme}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className={styles.tabBarPillLayer} aria-hidden="true" />

      <div ref={trackRef} className={styles.tabBarBlobTrack} aria-hidden="true">
        <div
          className={`${styles.tabBarSlidingBlob} ${styles[`blobTone_${activeTone}`] ?? ""}`}
          style={
            {
              width: `calc(100% / ${Math.max(1, items.length)})`,
              transform: `translate3d(${displayedIndex * 100}%, 0, 0)`,
            } as CSSProperties
          }
        />
      </div>

      <div
        className={styles.tabBarItemsLayer}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const isSelected = index === displayedIndex;
          const toneClass = item.tone ? styles[`itemTone_${item.tone}`] : "";
          const itemClassName = `${styles.tabBarItem} ${toneClass} ${
            isSelected ? styles.tabBarItemActive : ""
          }`;

          if (item.href) {
            return (
              <AppLink
                key={item.id}
                href={item.href}
                className={itemClassName}
                onClick={() => handleItemActivate(item)}
              >
                <span className={styles.tabBarItemIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <span className={styles.tabBarItemLabel}>{item.label}</span>
              </AppLink>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className={itemClassName}
              onClick={() => handleItemActivate(item)}
            >
              <span className={styles.tabBarItemIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.tabBarItemLabel}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
