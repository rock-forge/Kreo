"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, Heart, ListMusic, Loader2 } from "lucide-react";
import StudioArtwork from "@/components/StudioArtwork";
import KreoBrand from "@/components/KreoBrand";
import "./landing.css";

const features = [
  { number: "01", icon: AudioLines, title: "Find your next repeat.", text: "A song, an artist, a link, or a whole new mood. Search for it and bring it straight to your server." },
  { number: "02", icon: ListMusic, title: "Make the queue yours.", text: "Keep the good music coming. See what is playing, choose what comes next, and control it all together." },
  { number: "03", icon: Heart, title: "Keep what you love.", text: "Save a favorite. Start a playlist. Build a collection that feels a little more like you." },
];

export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [router, status]);

  async function login() {
    if (signingIn) return;
    setSigningIn(true);
    setError("");
    try {
      await signIn("discord", { callbackUrl: "/dashboard" });
    } catch {
      setError("Discord sign-in could not be opened. Please try again.");
      setSigningIn(false);
    }
  }

  if (status === "authenticated") {
    return <div className="app-loading"><Loader2 className="mx-auto animate-spin text-primary" />Opening your dashboard…</div>;
  }

  const loginDisabled = signingIn || status === "loading";

  return (
    <div className="landing-shell relative isolate min-h-screen overflow-x-clip text-[#f5f4ff]">
      <header className="mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-6 py-7 sm:px-10 lg:px-12">
        <Link href="/" aria-label="Kreo home"><KreoBrand /></Link>
        <nav aria-label="Main navigation" className="flex items-center gap-7 sm:gap-10">
          <a href="#experience" className="hidden text-[13px] text-[#a5a2b5] transition-colors hover:text-white sm:block">The experience</a>
          <Link href="/api/invite" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 text-[13px] text-[#a5a2b5] transition-colors hover:text-white md:inline-flex">Invite Kreo <ArrowUpRight size={14} /></Link>
          <button onClick={login} disabled={loginDisabled} className="inline-flex min-h-11 items-center gap-3 text-[13px] font-semibold transition-colors hover:text-primary disabled:opacity-50">
            {signingIn ? <Loader2 size={16} className="animate-spin" /> : null}Log in with Discord<ArrowUpRight size={17} />
          </button>
        </nav>
      </header>

      <main>
        <section className="landing-hero relative mx-auto grid max-w-[1360px] items-center gap-6 px-6 pb-14 pt-12 sm:px-10 sm:pb-20 sm:pt-16 lg:min-h-[650px] lg:grid-cols-[1.1fr_1fr] lg:gap-0 lg:px-12 lg:pb-20 lg:pt-9">
          <div className="relative z-10">
            <p className="mb-7 text-[11px] font-semibold uppercase tracking-[.22em] text-[#a5a2b5]">Your people. Your soundtrack.</p>
            <h1 className="text-[clamp(3rem,6.25vw,6.2rem)] font-semibold leading-[1.03] tracking-[-.075em]">Your server.<br /><span className="landing-gradient-text">In full sound.</span></h1>
            <p className="mt-7 max-w-[450px] text-[15px] leading-8 text-[#b4a5c4] sm:mt-8 sm:text-base">The late nights. The next game. The song everyone stays for. Bring your people together with music that keeps the moment going.</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4 sm:mt-10">
              <button onClick={login} disabled={loginDisabled} className="studio-button inline-flex min-h-[54px] items-center justify-center gap-5 rounded-full bg-[#c2a4ff] px-7 text-sm font-semibold text-[#17101f] transition hover:bg-[#d1baff] disabled:opacity-50">
                {signingIn ? <Loader2 size={17} className="animate-spin" /> : null}Open dashboard<ArrowRight size={18} />
              </button>
              <Link href="/api/invite" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 text-[13px] font-medium text-[#e1dceb] transition hover:text-primary">Add to Discord<ArrowUpRight size={16} /></Link>
            </div>
            {error && <p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}
            <a href="#experience" className="mt-12 inline-flex min-h-10 items-center gap-3 text-[11px] text-[#858093] transition hover:text-[#c2a4ff] sm:mt-14"><ArrowDown size={14} />A better way to listen together</a>
          </div>

          <div aria-hidden="true" className="landing-hero-stage pointer-events-auto relative hidden min-h-[540px] lg:block">
            <div className="landing-orbit" />
            <StudioArtwork src="/art/headphones-studio.webp" priority className="absolute -inset-x-8 -top-5 bottom-2 h-full w-[calc(100%+4rem)]" />
          </div>
        </section>

        <section id="experience" className="mx-auto max-w-[1360px] px-6 pb-16 sm:px-10 lg:px-12 lg:pb-24">
          <div className="flex flex-col justify-between gap-6 border-t border-white/10 pt-9 sm:pt-12 lg:flex-row lg:items-end">
            <h2 className="max-w-lg text-[clamp(2rem,3.4vw,3.5rem)] font-medium leading-[1.12] tracking-[-.055em]">Less searching.<br /><span className="text-[#858093]">More listening.</span></h2>
            <p className="max-w-sm text-sm leading-7 text-[#a5a2b5]">Everything you need for the music.<br className="hidden sm:block" /> Space for the moments in between.</p>
          </div>
          <div className="mt-10 grid gap-9 sm:mt-14 sm:grid-cols-3 sm:gap-8 lg:gap-14">
            {features.map(({ number, icon: Icon, title, text }) => (
              <article key={number} className="landing-feature border-t border-white/8 pt-6">
                <div className="mb-7 flex items-center justify-between text-[#7e788e]"><span className="text-[11px] tabular-nums">{number}</span><span className="landing-feature-icon"><Icon size={24} strokeWidth={1.5} /></span></div>
                <h3 className="text-lg font-semibold tracking-[-.025em]">{title}</h3>
                <p className="mt-3 max-w-sm text-[13px] leading-7 text-[#a5a2b5]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1360px] px-6 sm:px-10 lg:px-12">
          <div className="landing-finale flex flex-col justify-between gap-7 py-12 sm:flex-row sm:items-center sm:py-16">
            <h2 className="text-3xl font-medium tracking-[-.05em] sm:text-[42px]">One more song?<br /><span className="text-[#b9a3d0]">Make it a night.</span></h2>
            <button onClick={login} disabled={loginDisabled} className="inline-flex min-h-[54px] w-fit items-center gap-5 rounded-full border border-[#c2a4ff]/35 px-6 text-sm font-medium text-[#d7c4fa] transition hover:border-[#c2a4ff] hover:bg-[#c2a4ff]/5 disabled:opacity-50">Let&apos;s play{signingIn ? <Loader2 size={17} className="animate-spin" /> : <ArrowUpRight size={19} />}</button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-6 border-t border-white/6 px-6 py-7 text-[11px] text-[#7e788e] sm:px-10 lg:px-12">
        <div className="flex items-center gap-5"><span className="text-2xl font-extrabold tracking-[-.075em] text-[#c8c2d4]">kreo</span><span>Made for your people.</span></div>
        <div className="flex gap-6"><Link href="/privacy" className="transition hover:text-[#c2a4ff]">Privacy</Link><Link href="/terms" className="transition hover:text-[#c2a4ff]">Terms</Link></div>
      </footer>
    </div>
  );
}

