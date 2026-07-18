"use client";

import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SHORTCUTS = [
  { keys: "Space", action: "Play / pause" },
  { keys: "← / →", action: "Seek 5 seconds" },
  { keys: "J / K", action: "Previous / next track" },
  { keys: "↑ / ↓", action: "Move selection in list" },
  { keys: "Enter", action: "Play selected ready track" },
  { keys: "?", action: "Show shortcuts" },
] as const;

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function KeyboardShortcutsHint({ open, onOpenChange }: Props) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-full text-muted-foreground"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <Keyboard className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Keyboard shortcuts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ul className="flex flex-col gap-1 px-1 py-1">
          {SHORTCUTS.map((row) => (
            <li
              key={row.keys}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{row.action}</span>
              <kbd className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground tabular-nums">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
