"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TAB_ITEMS = [
  {
    href: "/",
    label: "HOME",
    Icon: IconHome,
  },
  {
    href: "/reports",
    label: "REPORTS",
    Icon: IconReports,
  },
  {
    href: "/community",
    label: "COMMUNITY",
    Icon: IconCommunity,
  },
  {
    href: "/settings",
    label: "SETTINGS",
    Icon: IconSettings,
  },
] as const;

/**
 * 하단 고정 탭 바 — 흰 배경, polished teal 아이콘.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="bottom-tab-bar" aria-label="주요 화면">
      {TAB_ITEMS.map(({ href, label, Icon }) => {
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
            <Icon active={isActive} />
            <span className="bottom-tab-bar__label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function IconHome({ active }: { active: boolean }) {
  const stroke = active ? "#0f766e" : "#5eead4";
  const fill = active ? "rgba(15, 118, 110, 0.12)" : "transparent";
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="bottom-tab-bar__icon"
    >
      <path
        fill={fill}
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
      />
    </svg>
  );
}

function IconReports({ active }: { active: boolean }) {
  const stroke = active ? "#0f766e" : "#5eead4";
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="bottom-tab-bar__icon"
    >
      <path
        d="M4 19V5"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 12h3l3-7 4 14 3-7h3"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCommunity({ active }: { active: boolean }) {
  const stroke = active ? "#0f766e" : "#5eead4";
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="bottom-tab-bar__icon"
    >
      <path
        d="M7.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke={stroke}
        strokeWidth="1.75"
      />
      <path
        d="M3 18.5v-1a4 4 0 0 1 4-4h1"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke={stroke}
        strokeWidth="1.75"
      />
      <path
        d="M21 18.5v-1a4 4 0 0 0-4-4h-1"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings({ active }: { active: boolean }) {
  const stroke = active ? "#0f766e" : "#5eead4";
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="bottom-tab-bar__icon"
    >
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke={stroke}
        strokeWidth="1.75"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
