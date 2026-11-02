"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Hash, Loader2, Lock, Save, Settings, Shield, Users } from "lucide-react";

const MAX_VOLUME = 100;
const MIN_VOLUME = 1;

function clampVolume(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 80;
  }

  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, Math.round(numericValue)));
}

export default function SettingsPage() {
  const params = useParams();
  const guildId = params.id;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const saveRequest = useRef(false);
  const [canEditRestrictedSettings, setCanEditRestrictedSettings] = useState(false);
  
  const [settings, setSettings] = useState({
    prefix: ".",
    volume: 80,
    is247Enabled: false,
    voiceChannel: "",
    textChannel: "",
    logsChannel: "",
    voiceRole: "",
    ignoredChannels: []
  });
  
  const [channels, setChannels] = useState({ voiceChannels: [], textChannels: [] });
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      setLoading(true);
      setLoadError("");
      try {
        const [setRes, chanRes, roleRes] = await Promise.all([
          fetch(`/api/settings/${guildId}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/bot/guild/${guildId}/channels`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/bot/guild/${guildId}/roles`, { cache: "no-store", signal: controller.signal })
        ]);
        const [setData, chanData, roleData] = await Promise.all([setRes.json(), chanRes.json(), roleRes.json()]);
        if (controller.signal.aborted) return;
        if (!setRes.ok || !setData.settings) throw new Error(setData.error || "Your server settings could not be loaded.");
        if (!chanRes.ok || !roleRes.ok) throw new Error("Channels and roles could not be loaded. Please retry before editing settings.");
        
        if (setRes.ok) {
          setCanEditRestrictedSettings(Boolean(setData?.access?.canEditRestrictedSettings));
          setSettings((prev) => ({
            ...prev,
            ...setData.settings,
            volume: clampVolume(setData?.settings?.volume ?? prev.volume),
            ignoredChannels: Array.isArray(setData?.settings?.ignoredChannels)
              ? setData.settings.ignoredChannels
              : [],
          }));
        }
        
        if (chanRes.ok) {
          setChannels({ voiceChannels: Array.isArray(chanData.voiceChannels) ? chanData.voiceChannels : [], textChannels: Array.isArray(chanData.textChannels) ? chanData.textChannels : [] });
        }

        if (roleRes.ok) {
          setRoles(Array.isArray(roleData) ? roleData : []);
        }
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(e.message || "Could not load settings. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    init();
    return () => controller.abort();
  }, [guildId, retry]);

  useEffect(() => {
    if (!status) {
      return undefined;
    }

    const timeout = setTimeout(() => setStatus(null), 3200);
    return () => clearTimeout(timeout);
  }, [status]);

  const handleSave = async () => {
    if (saveRequest.current || loading || loadError) return;
    saveRequest.current = true;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus({ type: "success", message: "Settings saved." });
        if (data?.access?.canEditRestrictedSettings !== undefined) {
          setCanEditRestrictedSettings(Boolean(data.access.canEditRestrictedSettings));
        }
      } else {
        setStatus({ type: "error", message: data.error || "Failed to save settings." });
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", message: "An error occurred while saving." });
    } finally {
      saveRequest.current = false;
      setSaving(false);
    }
  };

  if (loading) return <div aria-label="Loading server settings" className="animate-pulse space-y-8"><div className="h-12 w-56 rounded-lg bg-white/5" /><div className="h-48 rounded-2xl bg-white/4" /></div>;
  if (loadError) return <div role="alert" className="studio-surface mx-auto max-w-xl p-8"><AlertCircle className="mb-4 text-primary" size={28} /><h1 className="text-xl font-semibold">Settings unavailable</h1><p className="mt-3 text-sm leading-7 text-[#a5a2b5]">{loadError}</p><button onClick={() => setRetry(value => value + 1)} className="studio-button mt-6 min-h-12 px-5 text-sm">Try again</button></div>;

  return (
    <div className="studio-page mx-auto max-w-6xl pb-10">
      {status && <div role="status" className={`mb-6 flex items-center gap-3 border-l-2 px-4 py-3 text-sm ${status.type === "success" ? "border-primary bg-primary/5 text-[#ded5ef]" : "border-red-300 bg-red-400/5 text-red-100"}`}>{status.type === "success" ? <CheckCircle2 size={17} className="shrink-0 text-primary" /> : <AlertCircle size={17} className="shrink-0" />}<span>{status.message}</span></div>}
      <header className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p className="studio-eyebrow">Make it yours</p><h1 className="studio-title mt-3">Server settings</h1><p className="studio-description mt-4">The little details behind a better listening session.</p></div>
        <button onClick={handleSave} disabled={saving} className="studio-button inline-flex min-h-12 items-center justify-center gap-2 px-6 text-sm disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}{saving ? "Saving…" : "Save changes"}</button>
      </header>
      <div>
        <section className="studio-section grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-white/8 py-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <div><Settings size={19} className="mb-3 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-white">The basics</h2><p className="mt-2 text-xs leading-6 text-[#777185]">Your command shortcut and starting volume.</p></div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-7 md:grid-cols-2"><div className="min-w-0"><label htmlFor="command-prefix" className="mb-3 block text-sm font-medium text-[#d6d0e2]">Command prefix</label><input id="command-prefix" type="text" value={settings.prefix} onChange={event => setSettings({...settings, prefix: event.target.value})} className="studio-input min-w-0 w-full" placeholder="e.g. ." /><p className="mt-3 text-xs leading-6 text-[#777185]">Starts the bot&apos;s text commands.</p></div><div className="min-w-0"><label htmlFor="default-volume" className="mb-5 flex items-center justify-between text-sm font-medium text-[#d6d0e2]"><span>Default volume</span><span className="tabular-nums text-primary">{settings.volume}%</span></label><input id="default-volume" type="range" min="1" max="100" value={settings.volume} onChange={event => setSettings({...settings, volume: clampVolume(event.target.value)})} className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary" /><p className="mt-5 text-xs leading-6 text-[#777185]">Applied to new players, from 1–100%.</p></div></div>
        </section>
        <section className="studio-section grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-white/8 py-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <div><Clock size={19} className="mb-3 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-white">Always here</h2><p className="mt-2 text-xs leading-6 text-[#777185]">Keep Kreo in your voice channel around the clock.</p>{!canEditRestrictedSettings && <p className="mt-3 flex items-center gap-1.5 text-xs text-[#c2a4ff]"><Lock size={12} />Server owner only</p>}</div>
          <div className="min-w-0 space-y-6"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><label htmlFor="always-on" className="text-sm font-medium text-[#d6d0e2]">24/7 mode</label><p className="mt-2 text-xs leading-6 text-[#777185]">Automatically rejoins after a restart.</p></div><label className={`relative inline-flex shrink-0 items-center ${canEditRestrictedSettings ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}><input id="always-on" type="checkbox" checked={settings.is247Enabled} onChange={event => setSettings({...settings, is247Enabled: event.target.checked})} disabled={!canEditRestrictedSettings} className="peer sr-only" /><span className="relative block h-6 w-11 rounded-full bg-[#36313f] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-[#a5a2b5] after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-checked:after:bg-[#21152f] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary" /></label></div>
            <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 ${settings.is247Enabled ? "" : "pointer-events-none opacity-40"} ${!canEditRestrictedSettings ? "opacity-50" : ""}`}><div className="min-w-0"><label htmlFor="voice-channel" className="mb-3 block text-sm font-medium text-[#d6d0e2]">Voice channel</label><select id="voice-channel" value={settings.voiceChannel} onChange={event => setSettings({...settings, voiceChannel: event.target.value})} disabled={!canEditRestrictedSettings} className="studio-input kreo-select min-w-0 w-full max-w-full"><option value="" disabled>Select a voice channel</option>{channels.voiceChannels?.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></div><div className="min-w-0"><label htmlFor="text-channel" className="mb-3 block text-sm font-medium text-[#d6d0e2]">Text channel</label><select id="text-channel" value={settings.textChannel} onChange={event => setSettings({...settings, textChannel: event.target.value})} disabled={!canEditRestrictedSettings} className="studio-input kreo-select min-w-0 w-full max-w-full"><option value="" disabled>Select a text channel</option>{channels.textChannels?.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></div></div>
          </div>
        </section>
        <section className="studio-section grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-white/8 py-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <div><Hash size={19} className="mb-3 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-white">Action logs</h2><p className="mt-2 text-xs leading-6 text-[#777185]">A record of music actions in your server.</p></div><div className="min-w-0 max-w-xl"><label htmlFor="logs-channel" className="mb-3 block text-sm font-medium text-[#d6d0e2]">Log channel</label><select id="logs-channel" value={settings.logsChannel} onChange={event => setSettings({...settings, logsChannel: event.target.value})} className="studio-input kreo-select min-w-0 w-full max-w-full"><option value="">Disabled</option>{channels.textChannels?.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></div>
        </section>
        <section className="studio-section grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-white/8 py-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <div><Users size={19} className="mb-3 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-white">Voice role</h2><p className="mt-2 text-xs leading-6 text-[#777185]">Give listeners a role when they join voice.</p>{!canEditRestrictedSettings && <p className="mt-3 flex items-center gap-1.5 text-xs text-[#c2a4ff]"><Lock size={12} />Server owner only</p>}</div><div className="min-w-0 max-w-xl"><label htmlFor="voice-role" className="mb-3 block text-sm font-medium text-[#d6d0e2]">Automatic role</label><select id="voice-role" value={settings.voiceRole} onChange={event => setSettings({...settings, voiceRole: event.target.value})} disabled={!canEditRestrictedSettings} className="studio-input kreo-select min-w-0 w-full max-w-full disabled:opacity-50"><option value="">Disabled</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
        </section>
        <section className="studio-section grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-white/8 py-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <div><Shield size={19} className="mb-3 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-white">Quiet channels</h2><p className="mt-2 text-xs leading-6 text-[#777185]">Kreo ignores commands in the channels you select.</p></div><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-x-8 sm:grid-cols-2">{channels.textChannels?.map(channel => <label key={channel.id} className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 border-b border-white/7 py-3 text-sm text-[#a5a2b5] transition hover:text-white"><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={settings.ignoredChannels.includes(channel.id)} onChange={event => { const newIgnored = event.target.checked ? [...settings.ignoredChannels, channel.id] : settings.ignoredChannels.filter(id => id !== channel.id); setSettings({...settings, ignoredChannels: newIgnored}); }} /><Hash size={14} className="shrink-0 text-[#615b70]" /><span className="min-w-0 flex-1 truncate">{channel.name}</span></label>)}{channels.textChannels.length === 0 && <p className="py-2 text-sm text-[#777185]">No text channels are available.</p>}</div>
        </section>
      </div>
    </div>
  );
}
