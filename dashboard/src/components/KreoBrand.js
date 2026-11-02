import Image from "next/image";

export default function KreoBrand({ compact = false }) {
  const size = compact ? 32 : 42;
  return <span className="inline-flex shrink-0 items-center gap-2.5 sm:gap-3">
    <Image src="/branding/kreo-girl-v2.webp" alt="" width={size} height={size} sizes={size + "px"} className="shrink-0 rounded-full object-cover" />
    <span className={"studio-wordmark " + (compact ? "!text-2xl" : "")}>kreo</span>
  </span>;
}
