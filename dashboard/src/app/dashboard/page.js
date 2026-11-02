"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Clock3, Heart, ListMusic, Loader2, Pin, Radio, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import StudioArtwork from "@/components/StudioArtwork";
import { emptyRoomPreferencesSnapshot, parseRoomPreferences, recordRoomVisit, roomPreferencesSnapshot, subscribeRoomPreferences, toggleRoomPin } from "@/lib/roomPreferences";
import "./home.css";

function canManage(guild) { if (guild?.owner) return true; try { const p = BigInt(guild?.permissions || "0"); return (p & 32n) === 32n || (p & 8n) === 8n; } catch { return false; } }

export default function DashboardSelect() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id || "";
  const [guilds,setGuilds] = useState([]);
  const [botGuilds,setBotGuilds] = useState([]);
  const [loading,setLoading] = useState(true);
  const [filter,setFilter] = useState("");
  const [view,setView] = useState("all");
  const [error,setError] = useState("");
  const [reload,setReload] = useState(0);
  const [notice,setNotice] = useState("");
  const snapshot = useSyncExternalStore(subscribeRoomPreferences,
    useCallback(() => roomPreferencesSnapshot(userId), [userId]), emptyRoomPreferencesSnapshot);
  const preferences = useMemo(() => parseRoomPreferences(snapshot), [snapshot]);
  const pinnedSet = useMemo(() => new Set(preferences.pinned), [preferences]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let controller;
    let mounted = true;
    async function load() {
      controller?.abort(); controller = new AbortController();
      const active = controller;
      try {
        const guildRes = await fetch("/api/discord/guilds",{cache:"no-store",signal:active.signal});
        const data = await guildRes.json();
        if (!guildRes.ok || !Array.isArray(data)) throw new Error("Your server list could not be loaded. Please try again.");
        if (!mounted || active.signal.aborted) return;
        setGuilds(data);
        const botRes = await fetch("/api/bot/bot-guilds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({guildIds:data.map(guild => guild.id)}),signal:active.signal});
        const joined = await botRes.json();
        if (!botRes.ok || !Array.isArray(joined)) throw new Error("We could not check your connected servers. Try refreshing the list.");
        if (!mounted || active.signal.aborted) return;
        setBotGuilds(joined); setError("");
      } catch (cause) { if (mounted && !active.signal.aborted) setError(cause.message || "Could not load your servers."); }
      finally { if (mounted && !active.signal.aborted) setLoading(false); }
    }
    load();
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus",onFocus);
    return () => { mounted = false; controller?.abort(); window.removeEventListener("focus",onFocus); };
  },[status,reload]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const joinedSet = useMemo(() => new Set(botGuilds),[botGuilds]);
  const connectedCount = guilds.filter(guild => joinedSet.has(guild.id)).length;
  const pinnedCount = guilds.filter(guild => pinnedSet.has(guild.id)).length;
  const recentGuilds = preferences.recent.map(id => guilds.find(guild => guild.id === id && joinedSet.has(id))).filter(Boolean).slice(0,3);
  const filtered = guilds.filter(guild => (view !== "connected" || joinedSet.has(guild.id)) && (view !== "pinned" || pinnedSet.has(guild.id)) && guild.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a,b) => Number(joinedSet.has(b.id))-Number(joinedSet.has(a.id)) || Number(pinnedSet.has(b.id))-Number(pinnedSet.has(a.id)) || a.name.localeCompare(b.name));
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  function visit(guildId) { if (joinedSet.has(guildId)) recordRoomVisit(userId, guildId); }
  function pin(guildId) {
    const wasPinned = pinnedSet.has(guildId);
    const result = toggleRoomPin(userId, guildId);
    if (result.updated) setNotice(result.persisted ? (wasPinned ? "Room unpinned." : "Room pinned. Find it in your Pinned tab.") : "Your pins are available for this visit.");
  }

  if (loading) return <div className="app-loading"><Loader2 size={25} className="mx-auto animate-spin text-primary" /><p className="text-sm">Finding your servers…</p></div>;
  return <div className="studio-page dashboard-home">
    <section className="studio-welcome home-sound-stage">
      <div className="studio-welcome-copy">
        <p className="studio-eyebrow">Your listening space</p>
        <h1>Your music.<br /><span>A little closer.</span></h1>
        <p className="studio-description">Hey {firstName}. Pick your people, find your next favorite,<br className="hidden xl:block" /> and make the room sound like you.</p>
        <div className="dashboard-home-welcome-actions">
          {recentGuilds[0] ? <Link href={"/dashboard/"+recentGuilds[0].id} onClick={()=>visit(recentGuilds[0].id)} className="studio-button">Back to your room <ArrowRight size={17} /></Link> : <a href="#your-servers" className="studio-button">Choose a server <ArrowDown size={16} /></a>}
          <Link href="/dashboard/playlists" className="home-hero-link">Your playlists <ArrowUpRight size={16} /></Link>
        </div>
      </div>
      <StudioArtwork src="/art/headphones-studio.webp" className="studio-welcome-art home-sound-art" priority />
    </section>

    <div className="home-workspace-summary" aria-label="Your workspace summary">
      <p><strong>{connectedCount}</strong> connected {connectedCount===1?"room":"rooms"}</p>
      <p><strong>{guilds.length}</strong> servers in your workspace</p>
      <p><strong>{pinnedCount}</strong> pinned</p>
    </div>

    <section aria-label="Your collection" className="studio-shortcuts home-collection">{[
      ["/dashboard/library",Heart,"Liked songs","The soundtrack you keep.","Liked","home-collection-heart"],
      ["/dashboard/playlists",ListMusic,"Your playlists","A collection for every mood.","Playlists","home-collection-playlists"],
      ["/dashboard/leaderboard",Radio,"Live activity","Find a room with something on.","Activity","home-collection-live"],
    ].map(([href,Icon,title,description,shortTitle,tone]) => <Link key={href} href={href} aria-label={title} className="studio-shortcut group"><span className={"home-collection-art "+tone} aria-hidden="true"><Icon size={25} strokeWidth={1.7} /></span><div className="min-w-0 flex-1"><h2><span className="dashboard-home-shortcut-title">{title}</span><span className="dashboard-home-shortcut-short" aria-hidden="true">{shortTitle}</span></h2><p>{description}</p></div><ArrowUpRight size={17} className="dashboard-home-shortcut-arrow shrink-0" /></Link>)}</section>

    {recentGuilds.length>0 && <section className="home-recent-section" aria-label="Recently opened rooms"><div className="home-section-heading"><div><p className="studio-eyebrow">Right where you left off</p><h2>Jump back in</h2></div><Clock3 size={18} aria-hidden="true" /></div><div className="home-recent-grid">{recentGuilds.map(guild=><Link key={guild.id} href={"/dashboard/"+guild.id} onClick={()=>visit(guild.id)} className="home-recent-room"><GuildIcon guild={guild} /><div className="min-w-0 flex-1"><h3 className="truncate" title={guild.name}>{guild.name}</h3><p>Open listening room</p></div><ArrowUpRight size={17} className="shrink-0" /></Link>)}</div></section>}

    {error && <div role="alert" className="studio-notice mt-6 flex flex-wrap items-center justify-between gap-3"><span>{error}</span><button onClick={() => setReload(value=>value+1)} className="inline-flex min-h-11 items-center gap-2 text-xs"><RefreshCw size={14} />Try again</button></div>}
    <section id="your-servers" aria-label="Server list" className="dashboard-home-servers min-w-0 scroll-mt-24">
      <div className="studio-toolbar min-w-0"><div className="min-w-0"><p className="studio-eyebrow">Choose your company</p><h2>Your rooms <span>{guilds.length}</span></h2></div><label className="dashboard-home-search"><Search size={18} className="shrink-0" /><span className="sr-only">Search your servers</span><input type="search" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Find a server" /></label></div>
      <div className="dashboard-home-filters" aria-label="Filter your rooms">{[["all","All",guilds.length],["connected","Connected",connectedCount],["pinned","Pinned",pinnedCount]].map(([value,label,count])=><button key={value} onClick={()=>setView(value)} aria-pressed={view===value}>{label}<span>{count}</span></button>)}</div>
      {notice && <p role="status" className="home-pin-notice">{notice}</p>}
      <div className="home-server-grid grid min-w-0 grid-cols-1 gap-x-7 md:grid-cols-2 xl:grid-cols-3">{filtered.map(guild => <ServerItem key={guild.id} guild={guild} joined={joinedSet.has(guild.id)} pinned={pinnedSet.has(guild.id)} onPin={()=>pin(guild.id)} canPin={Boolean(userId)} onVisit={()=>visit(guild.id)} error={error} onRetry={()=>setReload(value=>value+1)} />)}</div>
      {filtered.length===0 && <div className="home-empty"><Pin size={24} className="mx-auto text-primary" aria-hidden="true" /><h3>{view==="pinned"&&!filter?"Keep your favorite rooms close":guilds.length?"No servers found":error?"Your servers are taking a moment":"Your music space is waiting"}</h3><p>{view==="pinned"&&!filter?"Tap the pin beside a server to keep it here.":guilds.length?"Try another name or view all servers.":"Join a Discord server, then come back to start listening."}</p>{(filter||view!=="all")&&<button onClick={()=>{setFilter("");setView("all");}} className="studio-button-quiet mt-4"><X size={14} />View all rooms</button>}</div>}
    </section>
  </div>;
}

function GuildIcon({guild}) {
  return <div className="studio-server-icon">{guild.icon?<img src={"https://cdn.discordapp.com/icons/"+guild.id+"/"+guild.icon+".png?size=128"} alt="" loading="lazy" />:guild.name.charAt(0)}</div>;
}

function ServerItem({guild,joined,pinned,onPin,canPin,onVisit,error,onRetry}) {
  const manage=canManage(guild);
  return <article className={"studio-server min-w-0"+(pinned?" home-server-pinned":"")}>
    <div className="dashboard-home-server-info"><GuildIcon guild={guild} /><div className="min-w-0 flex-1"><h3 className="truncate" title={guild.name}>{guild.name}</h3><p>{manage&&<ShieldCheck size={12} className="shrink-0" />}{manage?"Server manager":"Server member"}</p></div></div>
    <div className="dashboard-home-server-action"><span className="dashboard-home-server-status">{joined?"Ready to listen":"Invite required"}</span><div className="home-room-actions"><button onClick={onPin} disabled={!canPin} aria-label={(pinned?"Unpin ":"Pin ")+guild.name} aria-pressed={pinned} title={pinned?"Unpin room":"Pin room"} className="home-pin-button"><Pin size={16} fill={pinned?"currentColor":"none"} /></button>{joined?<Link href={"/dashboard/"+guild.id} onClick={onVisit} aria-label="Open player" className="home-room-open"><span className="home-action-long">Open player</span><span className="home-action-short">Open</span><ArrowRight size={16} className="shrink-0" /></Link>:error?<button onClick={onRetry} className="home-room-open"><RefreshCw size={13} className="shrink-0" />Retry</button>:manage?<a href={"/api/invite?guildId="+guild.id} aria-label="Invite Kreo" target="_blank" rel="noopener noreferrer" className="home-room-open"><span className="home-action-long">Invite Kreo</span><span className="home-action-short">Invite</span><ArrowUpRight size={14} className="shrink-0" /></a>:<span className="dashboard-home-manager-hint">Ask your server manager</span>}</div></div>
  </article>;
}
