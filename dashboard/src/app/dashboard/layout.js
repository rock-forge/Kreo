"use client";
import Link from "next/link";
import KreoBrand from "@/components/KreoBrand";
import CommandPalette from "@/components/CommandPalette";
import "./shell.css";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Disc3, Heart, Home, ListMusic, Loader2, LogOut, Radio, Search, Settings, User } from "lucide-react";

export default function DashboardLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const main = useRef(null);
  const guildId = /^\/dashboard\/(\d{17,20})(?:\/|$)/.exec(pathname)?.[1] || null;
  const [settingsAccess, setSettingsAccess] = useState(null);
  const [settingsGuild, setSettingsGuild] = useState(null);
  const canViewSettings = settingsGuild === guildId && settingsAccess === true;
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") { signOut({ callbackUrl: "/" }); return; }
    if (status === "unauthenticated") router.replace("/");
  }, [router, status, session?.error]);
  useEffect(() => {
    if (!guildId || status !== "authenticated") return;
    const controller = new AbortController();
    fetch("/api/settings/" + guildId, { cache: "no-store", signal: controller.signal })
      .then(response => { if (!controller.signal.aborted && (response.ok || response.status === 403 || response.status === 401)) { setSettingsGuild(guildId); setSettingsAccess(response.ok); } })
      .catch(() => {});
    return () => controller.abort();
  }, [guildId, status]);
  useEffect(() => {
    if (settingsGuild === guildId && settingsAccess === false && pathname === "/dashboard/" + guildId + "/settings") router.replace("/dashboard/" + guildId);
  }, [guildId, pathname, router, settingsAccess, settingsGuild]);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [pathname]);
  if (status !== "authenticated" || session?.error) return <div className="app-loading"><Loader2 className="mx-auto animate-spin text-primary" size={24} /><p className="text-sm">Opening your music space…</p></div>;
  const collection = [
    { href: "/dashboard", icon: Home, label: "Your servers", short: "Servers" },
    { href: "/dashboard/library", icon: Heart, label: "Liked songs", short: "Liked" },
    { href: "/dashboard/playlists", icon: ListMusic, label: "Playlists", short: "Playlists" },
    { href: "/dashboard/leaderboard", icon: Radio, label: "Live activity", short: "Activity" },
  ];
  const serverLinks = guildId ? [
    { href: "/dashboard/" + guildId, icon: Disc3, label: "Now playing", short: "Player" },
    { href: "/dashboard/" + guildId + "/search", icon: Search, label: "Discover", short: "Search" },
    { href: "/dashboard/" + guildId + "/queue", icon: ListMusic, label: "Queue", short: "Queue" },
    ...(canViewSettings ? [{ href: "/dashboard/" + guildId + "/settings", icon: Settings, label: "Server settings", short: "Settings" }] : []),
  ] : [];
  const mobileLinks = guildId ? serverLinks : collection;
  const currentLabel = [...serverLinks, ...collection].find(link => link.href === pathname)?.label || "Dashboard";
  function navLink(link) {
    const Icon = link.icon;
    return <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className="studio-nav-link"><Icon size={18} strokeWidth={1.7} /><span>{link.label}</span></Link>;
  }
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar hidden flex-col lg:flex">
      <Link href="/dashboard" aria-label="Kreo dashboard" className="px-6 pb-10 pt-8"><KreoBrand /></Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <p className="studio-eyebrow mb-4 px-3">Your library</p>
        <nav aria-label="Your library" className="space-y-1">{collection.map(navLink)}</nav>
        {guildId && <><p className="studio-eyebrow mb-4 mt-10 px-3">Listening room</p><nav aria-label="Server controls" className="space-y-1">{serverLinks.map(navLink)}</nav></>}
      </div>
      <div className="p-5">
        <Link href="/api/invite" target="_blank" rel="noopener noreferrer" className="mb-6 flex items-center justify-between px-2 text-xs font-medium text-[#a99bbd] transition hover:text-primary">Invite Kreo <ArrowUpRight size={16} /></Link>
        <div className="flex items-center gap-3 border-t border-white/6 px-1 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10">{session.user?.image ? <img src={session.user.image} alt="" className="h-full w-full object-cover" /> : <User size={17} className="text-primary" />}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{session.user?.name || "Music lover"}</p><p className="mt-1 text-[10px] text-[#777184]">Discord connected</p></div>
          <button aria-label="Sign out" title="Sign out" onClick={() => signOut({callbackUrl: "/"})} className="p-2 text-[#827b91] hover:text-white"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
    <main ref={main} id="main-content" className="dashboard-content">
      <header className="dashboard-mobile-header shell-topbar fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-3 px-5 lg:sticky lg:inset-x-auto lg:h-[76px] lg:gap-5 lg:px-9 xl:px-12">
        <Link href="/dashboard" aria-label="Kreo dashboard" className="shrink-0 lg:hidden"><KreoBrand compact /></Link>
        <div className="hidden min-w-0 items-center gap-3 text-xs text-[#94849f] lg:flex"><Link href="/dashboard" className="shrink-0 hover:text-primary">Your space</Link><span>/</span><span className="truncate text-[#d1c0e3]">{currentLabel}</span></div>
        <span className="min-w-0 flex-1 truncate text-center text-xs text-[#b2a9be] lg:hidden">{currentLabel}</span>
        <div className="flex shrink-0 items-center gap-1 lg:gap-6">
          <CommandPalette guildId={guildId} canViewSettings={canViewSettings} />
          <Link href="/api/invite" target="_blank" rel="noopener noreferrer" className="hidden min-h-11 items-center gap-2 whitespace-nowrap text-xs text-[#c7b7db] hover:text-primary lg:flex">Invite Kreo <ArrowUpRight size={14} /></Link>
          <button aria-label="Sign out" onClick={() => signOut({callbackUrl:"/"})} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#b6a9c5] lg:hidden"><LogOut size={18} /></button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1580px] px-5 pb-10 pt-6 sm:px-8 lg:px-9 lg:pt-4 xl:px-12">
        {guildId && <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-xs text-[#a199af] hover:text-primary lg:hidden"><ArrowLeft size={14} />Your servers</Link>}
        {children}
      </div>
    </main>
    <nav aria-label="Main controls" className="dashboard-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#0e0d15] px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
      <div className="grid" style={{gridTemplateColumns:"repeat(" + mobileLinks.length + ", minmax(0, 1fr))"}}>
        {mobileLinks.map(({href,icon:Icon,short}) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={"flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-xs font-medium " + (pathname === href ? "text-primary" : "text-[#a397b1]")}><Icon size={20} strokeWidth={1.7} /><span>{short}</span></Link>)}
      </div>
    </nav>
  </div>;
}

