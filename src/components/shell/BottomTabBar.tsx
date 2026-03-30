"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart2, Users, Settings } from "lucide-react";

const TAB_ITEMS = [
  { href: "/",          label: "HOME",      LucideIcon: Home      },
  { href: "/reports",   label: "REPORTS",   LucideIcon: BarChart2 },
  { href: "/community", label: "FRIENDS",   LucideIcon: Users     },
  { href: "/settings",  label: "SETTINGS",  LucideIcon: Settings  },
] as const;

/**
 * 하단 고정 탭 바 — Reflectly Soft UI × Mint
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="bottom-tab-bar" aria-label="주요 화면">
      {TAB_ITEMS.map(({ href, label, LucideIcon }) => {
        const isActive =
          href === "/"
            ? pathname === "/" || pathname === ""
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={`bottom-tab-bar__link${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <LucideIcon
              size={22}
              strokeWidth={isActive ? 2.2 : 1.75}
              color={isActive ? "#1e8f83" : "#94b8b3"}
              aria-hidden
              className="bottom-tab-bar__icon"
            />
            <span className="bottom-tab-bar__label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
