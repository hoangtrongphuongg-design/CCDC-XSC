"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

/** Ô tìm kiếm chung trên thanh trên. Bấm phím "/" (khi không đang gõ ở ô khác) để nhảy vào ô này. */
export function GlobalSearchBox() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form className="topbar-search" action="/search" method="get" role="search">
      <Search size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        name="q"
        type="search"
        placeholder="Tìm máy, tem nhôm, serial, mã phiếu…  ( / )"
        aria-label="Tìm kiếm chung"
        autoComplete="off"
        maxLength={120}
      />
    </form>
  );
}
