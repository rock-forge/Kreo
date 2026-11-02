import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Kreo Dashboard and the Kreo Discord music bot.",
  alternates: {
    canonical: "/privacy",
  },
};

const sections = [
  {
    title: "Information We Process",
    body:
      "Kreo may process limited Discord-related information needed to provide the bot and dashboard, such as user IDs, server IDs, channel IDs, role IDs, music queue context, and configuration settings.",
  },
  {
    title: "How Information Is Used",
    body:
      "This information is used to authenticate users, verify server access, provide music and dashboard features, store guild settings, support reconnect behavior, improve reliability, and protect the service from abuse.",
  },
  {
    title: "Dashboard Authentication",
    body:
      "When you sign in to the dashboard through Discord OAuth, Kreo uses your Discord account data and access token only as needed to confirm identity, check guild membership and permissions, and operate dashboard features.",
  },
  {
    title: "Stored Server Settings",
    body:
      "Kreo stores server-specific settings such as music preferences, 24/7 configuration, channel selections, role selections, and related operational data so the bot can function properly in each server.",
  },
  {
    title: "Logs and Security",
    body:
      "Kreo may keep operational logs, action logs, rate-limit records, and diagnostic information to monitor uptime, investigate bugs, prevent abuse, and maintain service security.",
  },
  {
    title: "Third-Party Services",
    body:
      "Kreo uses third-party services including Discord, hosting providers, database providers, and music/search infrastructure. Their own privacy practices may also apply to data processed through those platforms.",
  },
  {
    title: "Data Sharing",
    body:
      "Kreo does not sell your personal data. Information is only shared when necessary to run the service, comply with legal obligations, enforce security, or work with service providers that support Kreo operations.",
  },
  {
    title: "Data Retention",
    body:
      "Data is retained only as long as reasonably needed for service operation, security, troubleshooting, and stored server configuration. Some operational logs may be rotated or deleted over time.",
  },
  {
    title: "Your Choices",
    body:
      "You can stop using Kreo at any time by removing the bot from your server or stopping dashboard use. Server owners may remove stored server settings by disabling relevant features or removing Kreo from the server.",
  },
  {
    title: "Policy Updates",
    body:
      "This Privacy Policy may be updated from time to time. Continued use of Kreo after updates means you accept the revised policy.",
  },
  {
    title: "Contact",
    body:
      "For privacy-related questions, contact the Kreo operator through the official support or community channels.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#09060f] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="kreo-panel p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Kreo</p>
          <h1 className="gradient-text mt-3 text-4xl font-semibold text-white">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Last updated: April 30, 2026
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="kreo-chip kreo-focus rounded-full px-4 py-2 text-sm font-medium text-white transition hover:border-secondary/30 hover:bg-secondary/10"
            >
              Back to home
            </Link>
            <Link
              href="/terms"
              className="kreo-chip kreo-focus rounded-full border-secondary/20 bg-secondary/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-secondary/15"
            >
              Terms of Service
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {sections.map((section) => (
            <section key={section.title} className="kreo-card p-6">
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
