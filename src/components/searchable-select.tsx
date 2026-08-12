"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
  groupId?: string;
  disabled?: boolean;
};

type Props = {
  name: string;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  controllerId?: string;
  includeControllerValue?: boolean;
  excludeControllerValue?: boolean;
  defaultValue?: string;
};

export function SearchableSelect({
  name,
  options,
  placeholder = "Chọn",
  searchPlaceholder = "Gõ để tìm...",
  emptyText = "Không có dữ liệu phù hợp.",
  required,
  controllerId,
  includeControllerValue,
  excludeControllerValue,
  defaultValue = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(defaultValue);
  const [controllerValue, setControllerValue] = useState("");

  useEffect(() => {
    if (!controllerId) return;
    const el = document.getElementById(controllerId) as HTMLSelectElement | null;
    if (!el) return;
    const sync = () => {
      setControllerValue(el.value);
      setValue((current) => {
        const found = options.find((option) => option.value === current);
        if (!found) return "";
        if (includeControllerValue && found.groupId !== el.value) return "";
        if (excludeControllerValue && found.groupId === el.value) return "";
        return current;
      });
    };
    sync();
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, [controllerId, excludeControllerValue, includeControllerValue, options]);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return options
      .filter((option) => !option.disabled)
      .filter((option) => {
        if (includeControllerValue && controllerValue && option.groupId !== controllerValue) return false;
        if (excludeControllerValue && controllerValue && option.groupId === controllerValue) return false;
        return true;
      })
      .filter((option) => {
        if (!normalized) return true;
        return `${option.label} ${option.description || ""}`.toLocaleLowerCase("vi").includes(normalized);
      })
      .slice(0, 80);
  }, [controllerValue, excludeControllerValue, includeControllerValue, options, query]);

  const selected = options.find((option) => option.value === value) || null;

  const choose = (option: SearchableOption) => {
    setValue(option.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="searchable-select" ref={rootRef}>
      <input type="hidden" name={name} value={value} required={required} />
      <button type="button" className="searchable-select-trigger" onClick={() => setOpen(true)} aria-haspopup="listbox" aria-expanded={open}>
        <Search size={17} aria-hidden="true" />
        <span className={selected ? "" : "muted"}>{selected?.label || placeholder}</span>
        {selected ? (
          <span
            role="button"
            tabIndex={0}
            className="searchable-select-clear"
            aria-label="Bỏ lựa chọn"
            onClick={(event) => { event.stopPropagation(); setValue(""); setQuery(""); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setValue(""); } }}
          ><X size={15} /></span>
        ) : null}
      </button>

      {open ? (
        <div className="searchable-select-menu" role="listbox">
          <div className="searchable-select-mobile-title">
            <strong>Chọn dụng cụ</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng"><X size={20} /></button>
          </div>
          <div className="searchable-select-search">
            <Search size={17} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
          </div>
          <div className="searchable-select-results">
            {filtered.length ? filtered.map((option) => (
              <button type="button" key={option.value} className="searchable-select-option" onClick={() => choose(option)}>
                <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
                {option.value === value ? <Check size={17} /> : null}
              </button>
            )) : <p className="searchable-select-empty">{emptyText}</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
