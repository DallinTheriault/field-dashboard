"use client";

import { Menu } from "lucide-react";

export const NAV_DRAWER_OPEN_EVENT = "field:nav-drawer-open";

/**
 * Hamburger trigger button. Lives inside the topbar (which has backdrop-blur,
 * creating a containing block that breaks `position: fixed` for any drawer
 * rendered as its descendant). So the drawer itself is a sibling at the
 * layout root. They communicate via a custom DOM event — simpler than
 * threading state through context, and avoids needing a global store.
 */
export function NavDrawerTrigger() {
  function open() {
    window.dispatchEvent(new CustomEvent(NAV_DRAWER_OPEN_EVENT));
  }
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={open}
      className="md:hidden btn-ghost h-9 w-9 px-0 shrink-0"
    >
      <Menu size={18} strokeWidth={1.8} />
    </button>
  );
}
