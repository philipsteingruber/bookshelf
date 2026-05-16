"use client";

import { useRef, useState } from "react";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { trpc } from "@/trpc/client";

interface SeriesComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
}

export const SeriesCombobox = ({
  value,
  onChange,
  onBlur,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
}: SeriesComboboxProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showDropdown) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
      e.preventDefault();
      commandRef.current?.dispatchEvent(
        new KeyboardEvent("keydown", { key: e.key, bubbles: true, cancelable: true }),
      );
    }
  };

  const { data } = trpc.book.getSeriesNames.useQuery();
  const allSeries = data?.series ?? [];

  const filtered = allSeries.filter((s) =>
    s.name.toLowerCase().includes(value.toLowerCase()),
  );

  const showDropdown = open && filtered.length > 0;

  return (
    <Popover open={showDropdown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          placeholder="Lord of the Rings"
          autoComplete="off"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: "var(--radix-popover-anchor-width)" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <Command ref={commandRef} shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              {filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
