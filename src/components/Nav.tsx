"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/prep", label: "Prep" },
  { href: "/eod", label: "EOD" },
  { href: "/meat-count", label: "Meat Count" },
  { href: "/analytics", label: "Analysis" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-zinc-900 text-white px-4 py-0 flex items-stretch">
      <span className="font-bold text-base tracking-tight flex items-center pr-6 border-r border-zinc-700 mr-2">
        CabinFlow
      </span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            pathname === href
              ? "text-white border-amber-400"
              : "text-zinc-400 border-transparent hover:text-white"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
