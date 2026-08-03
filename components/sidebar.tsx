"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Users,
  GitBranch,
  Clock,
  ClipboardList,
  Newspaper,
  Palette,
  Search,
  Shield,
  LogOut,
} from "lucide-react";

const analystLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/evidence", label: "Evidence", icon: FileText },
  { href: "/stories", label: "Stories", icon: BookOpen },
  { href: "/entities", label: "Entities", icon: Users },
  { href: "/graph", label: "Graph", icon: GitBranch },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/briefs", label: "Briefs", icon: Newspaper },
  { href: "/templates", label: "Templates", icon: Palette },
  { href: "/search", label: "Search", icon: Search },
];

const adminLinks = [{ href: "/admin", label: "Admin", icon: Shield }];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r subtle-border bg-[#0a0a0a]">
        <div className="flex h-16 items-center border-b subtle-border px-5">
          <Logo size="sm" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </aside>
    );
  }

  if (!user) return null;

  const links = [...analystLinks, ...(user.role === "admin" ? adminLinks : [])];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r subtle-border bg-[#0a0a0a]">
      {/* Logo */}
      <div className="flex h-16 items-center border-b subtle-border px-5">
        <Logo size="sm" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="space-y-0.5">
          {links.map((link) => {
            const Icon = link.icon;
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  active
                    ? "bg-white/[0.06] text-white font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                    : "text-[#86868b] hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px]",
                    active ? "text-[#2997ff]" : "text-[#86868b]",
                  )}
                  strokeWidth={1.8}
                />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t subtle-border p-4 mx-3 mb-3 rounded-xl bg-white/[0.02]">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#2997ff]/20 to-[#0066cc]/20 text-[#2997ff] text-xs font-semibold border border-[#2997ff]/20">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-[#86868b] truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#86868b] transition-colors hover:bg-white/[0.04] hover:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
