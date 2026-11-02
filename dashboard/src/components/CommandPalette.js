"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, AudioLines, CornerDownLeft, Heart, Home, ListMusic, Loader2, Radio, Search, Settings, X } from "lucide-react";
import "./command-palette.css";

const snowflake = /^\d{17,20}$/;
const CACHE_MS = 60_000;
const normalize = value => String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

function captureBackgroundScroll(node) {
  return [...new Set([node?.closest(".dashboard-content"), document.scrollingElement])]
    .filter(Boolean)
    .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
}

function restoreBackgroundScroll(snapshot) {
  for (const { element, top, left } of snapshot) {
    if (element.isConnected && (element.scrollTop !== top || element.scrollLeft !== left)) {
      element.scrollTo({ top, left, behavior: "instant" });
    }
  }
}

export default function CommandPalette({ guildId, canViewSettings = false, triggerClassName = "" }) {
  const router = useRouter();
  const identity = useId();
  const dialog = useRef(null);
  const input = useRef(null);
  const restoreFocus = useRef(null);
  const resultsList = useRef(null);
  const backgroundScroll = useRef([]);
  const openingPath = useRef("");
  const navigating = useRef(false);
  const request = useRef(null);
  const cacheTime = useRef(0);
  const options = useRef([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listId = `${identity}-results`;
  const titleId = `${identity}-title`;

  const loadGuilds = useCallback(async () => {
    if (Date.now() - cacheTime.current < CACHE_MS) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/discord/guilds", { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error("Your servers could not be loaded. Try opening search again.");
      const valid = data.filter(guild => snowflake.test(guild?.id || "") && typeof guild.name === "string");
      if (!valid.length) {
        setGuilds([]);
        cacheTime.current = Date.now();
        return;
      }
      const joinedResponse = await fetch("/api/bot/bot-guilds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildIds: valid.map(guild => guild.id) }), signal: controller.signal,
      });
      const joined = await joinedResponse.json().catch(() => null);
      if (!joinedResponse.ok || !Array.isArray(joined)) throw new Error("Connected servers could not be checked. Your pages are still available below.");
      if (controller.signal.aborted) return;
      const joinedIds = new Set(joined.filter(id => typeof id === "string" && snowflake.test(id)));
      setGuilds(valid.filter(guild => joinedIds.has(guild.id)).sort((a, b) => a.name.localeCompare(b.name)));
      cacheTime.current = Date.now();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || "Your servers could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  }, []);

  const openPalette = useCallback(() => {
    if (!dialog.current || dialog.current.open) return;
    restoreFocus.current = document.activeElement;
    backgroundScroll.current = captureBackgroundScroll(dialog.current);
    openingPath.current = window.location.pathname;
    navigating.current = false;
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
    dialog.current.showModal();
    input.current?.focus({ preventScroll: true });
    restoreBackgroundScroll(backgroundScroll.current);
    void loadGuilds();
  }, [loadGuilds]);

  const closePalette = useCallback(() => {
    dialog.current?.close();
    if (!navigating.current && window.location.pathname === openingPath.current) {
      restoreBackgroundScroll(backgroundScroll.current);
    }
  }, []);

  const finishClose = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setIsOpen(false);
    if (restoreFocus.current?.isConnected) restoreFocus.current.focus({ preventScroll: true });
    if (!navigating.current && window.location.pathname === openingPath.current) {
      restoreBackgroundScroll(backgroundScroll.current);
    }
  }, []);

  useEffect(() => {
    function keyboard(event) {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (dialog.current?.open) closePalette(); else openPalette();
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [closePalette, openPalette]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  const pages = useMemo(() => {
    const base = [
      { id: "servers", label: "Your servers", detail: "Choose a listening room", href: "/dashboard", icon: Home },
      { id: "liked", label: "Liked songs", detail: "Your saved favorites", href: "/dashboard/library", icon: Heart },
      { id: "playlists", label: "Your playlists", detail: "Collections for every mood", href: "/dashboard/playlists", icon: ListMusic },
      { id: "activity", label: "Live activity", detail: "See what is playing", href: "/dashboard/leaderboard", icon: Radio },
    ];
    if (snowflake.test(guildId || "")) {
      base.push(
        { id: "player", label: "Now playing", detail: "Current server player", href: `/dashboard/${guildId}`, icon: AudioLines },
        { id: "discover", label: "Search music", detail: "Find your next track", href: `/dashboard/${guildId}/search`, icon: Search },
        { id: "queue", label: "Queue", detail: "Manage what plays next", href: `/dashboard/${guildId}/queue`, icon: ListMusic },
      );
      if (canViewSettings) base.push({ id: "settings", label: "Server settings", detail: "Manage this listening room", href: `/dashboard/${guildId}/settings`, icon: Settings });
    }
    return base;
  }, [canViewSettings, guildId]);

  const results = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const all = [...pages.map(page => ({ ...page, group: "Pages" })), ...guilds.map(guild => ({
      id: guild.id, label: guild.name, detail: "Open server player", href: `/dashboard/${guild.id}`, group: "Connected servers", icon: AudioLines,
    }))];
    return all.filter(item => terms.every(term => normalize(`${item.label} ${item.detail} ${item.group}`).includes(term))).slice(0, 40);
  }, [guilds, pages, query]);
  const highlighted = Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    if (!isOpen || highlighted < 0) return;
    const list = resultsList.current;
    const option = options.current[highlighted];
    if (!list || !option) return;
    const listBounds = list.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    const visibleTop = listBounds.top + list.clientTop;
    const visibleBottom = visibleTop + list.clientHeight;
    if (optionBounds.top < visibleTop) {
      list.scrollTop -= visibleTop - optionBounds.top;
    } else if (optionBounds.bottom > visibleBottom) {
      list.scrollTop += optionBounds.bottom - visibleBottom;
    }
  }, [highlighted, isOpen, query]);

  function choose(item) {
    if (!item) return;
    navigating.current = true;
    closePalette();
    router.push(item.href);
  }

  function handleInputKey(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      setActiveIndex(event.key === "ArrowDown" ? (highlighted + 1) % results.length : (highlighted - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[highlighted]);
    }
  }

  return <>
    <button type="button" className={`kreo-command-trigger ${triggerClassName}`} onClick={openPalette} aria-label="Search servers and pages" aria-haspopup="dialog" aria-expanded={isOpen}>
      <Search size={17} /><span>Find a server or page</span><kbd>Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="kreo-command-dialog" aria-labelledby={titleId} onClose={finishClose} onClick={event => { if (event.target === event.currentTarget) closePalette(); }}>
      <div className="kreo-command-panel">
        <div className="kreo-command-heading"><div><p>YOUR NEXT DESTINATION</p><h2 id={titleId}>Where to?</h2></div><button type="button" onClick={closePalette} aria-label="Close search"><X size={20} /></button></div>
        <div className="kreo-command-input"><Search size={21} /><input ref={input} type="search" role="combobox" autoComplete="off" spellCheck="false" aria-label="Search servers and pages" aria-expanded={isOpen} aria-autocomplete="list" aria-controls={listId} aria-activedescendant={highlighted >= 0 ? `${identity}-option-${highlighted}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleInputKey} placeholder="A server, your queue, liked songs…" /><kbd>Esc</kbd></div>
        {error && <p className="kreo-command-error" role="status">{error}</p>}
        <div ref={resultsList} className="kreo-command-results" id={listId} role="listbox" aria-label="Destinations" aria-busy={loading}>
          {results.map((item, index) => {
            const Icon = item.icon;
            return <div key={item.id}>
              {(index === 0 || results[index - 1].group !== item.group) && <p className="kreo-command-group">{item.group}</p>}
              <button ref={element => { options.current[index] = element; }} type="button" id={`${identity}-option-${index}`} role="option" aria-selected={highlighted === index} tabIndex={-1} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)} className="kreo-command-option">
                <span className="kreo-command-icon"><Icon size={19} strokeWidth={1.6} /></span><span className="kreo-command-option-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} className="kreo-command-arrow" />
              </button>
            </div>;
          })}
          {!results.length && <div className="kreo-command-empty"><Search size={26} /><strong>No destinations found</strong><p>Try another server name or a page like “queue”.</p></div>}
          {loading && <p className="kreo-command-loading" role="status"><Loader2 size={15} className="animate-spin" />Finding your connected servers…</p>}
        </div>
        <div className="kreo-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to explore</span><span><CornerDownLeft size={13} /> to open</span><span>Make room for a good session.</span></div>
      </div>
    </dialog>
  </>;
}
