"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

function subscribeDesktop(onChange) {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", onChange);
  navigator.connection?.addEventListener?.("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    navigator.connection?.removeEventListener?.("change", onChange);
  };
}
function desktopSnapshot() {
  return window.matchMedia("(min-width: 1024px)").matches && !navigator.connection?.saveData;
}
function serverSnapshot() { return false; }

export default function StudioArtwork({ src = "/art/headphones-studio.webp", className = "", priority = false }) {
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const frame = useRef(null);
  useEffect(() => {
    if (!desktop || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (frame.current) frame.current.dataset.visible = String(entry.isIntersecting);
    }, { threshold: 0.05 });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [desktop]);
  function tilt(event) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientY - rect.top) / rect.height - 0.5) * -7;
    const y = ((event.clientX - rect.left) / rect.width - 0.5) * 9;
    frame.current?.style.setProperty("--art-x", `${x}deg`);
    frame.current?.style.setProperty("--art-y", `${y}deg`);
  }
  function reset() {
    frame.current?.style.setProperty("--art-x", "0deg");
    frame.current?.style.setProperty("--art-y", "0deg");
  }
  if (!desktop) return null;
  return <div ref={frame} aria-hidden="true" className={`studio-artwork ${className}`} onPointerMove={tilt} onPointerLeave={reset}>
    <Image src={src} alt="" width={1000} height={1000} sizes="(min-width: 1440px) 640px, 500px" preload={priority} className="studio-art-image" draggable={false} />
  </div>;
}
