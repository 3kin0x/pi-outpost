import { useCallback, useRef, useState } from "react";
import { clampPanelWidth, readPanelWidth, writePanelWidth, type PanelWidthConfig } from "../util/panelWidth";

interface PointerResize {
  pointerId: number;
  startX: number;
  startWidth: number;
}

export function useResizablePanelWidth(config: PanelWidthConfig) {
  const [width, setWidth] = useState(() => readPanelWidth(config));
  const widthRef = useRef(width);
  const pointerResizeRef = useRef<PointerResize | null>(null);

  const updateWidth = useCallback(
    (nextWidth: number) => {
      const clamped = clampPanelWidth(nextWidth, config);
      widthRef.current = clamped;
      setWidth(clamped);
      return clamped;
    },
    [config],
  );

  const finishPointerResize = useCallback(() => {
    if (pointerResizeRef.current === null) return;
    pointerResizeRef.current = null;
    writePanelWidth(widthRef.current, config);
  }, [config]);

  const separatorProps = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.isPrimary === false || (event.button ?? 0) !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      pointerResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: widthRef.current };
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = pointerResizeRef.current;
      if (resize === null || resize.pointerId !== event.pointerId) return;
      updateWidth(resize.startWidth + event.clientX - resize.startX);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerResizeRef.current?.pointerId !== event.pointerId) return;
      finishPointerResize();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = pointerResizeRef.current;
      if (resize === null || resize.pointerId !== event.pointerId) return;
      pointerResizeRef.current = null;
      updateWidth(resize.startWidth);
    },
    onLostPointerCapture: finishPointerResize,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;
      if (event.key === "ArrowLeft") nextWidth = widthRef.current - config.keyboardStep;
      else if (event.key === "ArrowRight") nextWidth = widthRef.current + config.keyboardStep;
      else if (event.key === "Home") nextWidth = config.defaultWidth;
      if (nextWidth === null) return;
      event.preventDefault();
      writePanelWidth(updateWidth(nextWidth), config);
    },
  };

  return { width, separatorProps };
}

interface PanelResizeHandleProps {
  label: string;
  width: number;
  config: PanelWidthConfig;
  separatorProps: ReturnType<typeof useResizablePanelWidth>["separatorProps"];
  className?: string;
}

export function PanelResizeHandle({ label, width, config, separatorProps, className = "" }: PanelResizeHandleProps) {
  return (
    <div
      {...separatorProps}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={config.minWidth}
      aria-valuemax={config.maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      title={label}
      className={`group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none ${className}`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-transparent transition-colors group-hover:bg-blue-400 group-focus-visible:bg-blue-500 group-active:bg-blue-500 dark:group-hover:bg-blue-500" />
    </div>
  );
}
