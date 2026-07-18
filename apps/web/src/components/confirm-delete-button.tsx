"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  idleLabel?: string;
  confirmLabel?: string;
};

export function ConfirmDeleteButton({
  onConfirm,
  disabled = false,
  className,
  idleLabel = "Delete",
  confirmLabel = "Confirm",
}: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!armed) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setArmed(false);
      }
    };

    const timer = window.setTimeout(() => setArmed(false), 4000);

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.clearTimeout(timer);
    };
  }, [armed]);

  const showConfirm = armed && !disabled;

  const handleClick = async () => {
    if (disabled || pending) return;

    if (!showConfirm) {
      setArmed(true);
      return;
    }

    setPending(true);
    try {
      await onConfirm();
      setArmed(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("inline-flex", className)}>
      <Button
        type="button"
        size="sm"
        variant={showConfirm ? "destructive" : "ghost"}
        disabled={disabled || pending}
        aria-expanded={showConfirm}
        className={cn(
          "h-8 min-w-18 rounded-full px-3 text-xs transition-all duration-200",
          showConfirm
            ? "text-destructive"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={(event) => {
          event.stopPropagation();
          void handleClick();
        }}
      >
        {pending ? "Deleting…" : showConfirm ? confirmLabel : idleLabel}
      </Button>
    </div>
  );
}
