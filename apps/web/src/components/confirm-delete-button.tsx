"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function ConfirmDeleteButton({ onConfirm, disabled = false, className }: Props) {
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
        size="icon-sm"
        variant={showConfirm ? "destructive" : "ghost"}
        disabled={disabled || pending}
        aria-expanded={showConfirm}
        aria-label={pending ? "Deleting" : showConfirm ? "Confirm delete" : "Delete"}
        title={disabled ? "Unavailable while processing" : showConfirm ? "Confirm delete" : "Delete"}
        className={cn(
          "size-8 shrink-0 rounded-full transition-all duration-200",
          showConfirm
            ? "text-destructive"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={(event) => {
          event.stopPropagation();
          void handleClick();
        }}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : showConfirm ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}
