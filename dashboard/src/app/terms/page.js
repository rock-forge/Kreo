import Link from "next/link";

export const metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Kreo Dashboard and the Kreo Discord music bot.",
  alternates: {
    canonical: "/terms",
  },
};

const sections = [
  {
    title: "Acceptance of Terms",
    body:
      "By using Kreo, the Kreo Dashboard, or inviting the bot into a Discord server, you agree to these Terms of Service. If you do not agree, do not use the service.",
  },
  {
    title: "Service Description",
    body:
      "Kreo is a free Discord music bot with a web dashboard for music playback, queue control, and server configuration. Features may change, improve, or be removed at any time.",
  },
  {
    title: "Acceptable Use",
    body:
      "You agree not to abuse, overload, reverse engineer, disrupt, or attempt unauthorized access to Kreo, its dashboard, connected infrastructure, or other users' servers and data.",
  },
  {
    title: "Third-Party Services",
    body:
      "Kreo relies on third-party services such as Discord, Lavalink, hosting providers, and music/search sources. Availability, results, and playback behavior may depend on those services.",
  },
  {
    title: "Server Responsibility",
    body:
      "Server owners and staff are responsible for how Kreo is configured and used in their communities. You are responsible for permissions you grant and the actions you take through the dashboard or bot commands.",
  },
  {
    title: "Availability and Warranty",
    body:
      "Kreo is provided on an as-is and as-available basis without warranties of uptime, fitness for a particular purpose, accuracy, or uninterrupted service.",
  },
  {
    title: "Limitation of Liability",
    body:
      "To the maximum extent allowed by law, Kreo and its operator will not be liable for indirect, incidental, special, consequential, or loss-related damages arising from use of the bot or dashboard.",
  },
  {
    title: "Termination",
    body:
      "Access to Kreo or the dashboard may be limited, suspended, or terminated at any time for abuse, security concerns, maintenance, legal reasons, or operational issues.",
  },
  {
    title: "Changes to These Terms",
    body:
      "These Terms may be updated from time to time. Continued use of Kreo after changes means you accept the updated Terms.",
  },
  {
    title: "Contact",
    body:
      "For questions about these Terms, contact the Kreo operator through the official support or community channels.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#09060f] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="kreo-panel p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Kreo</p>
          <h1 className="gradient-text mt-3 text-4xl font-semibold text-white">Terms of Service</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Last updated: April 30, 2026
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Kreo by{" "}
            <a href="https://github.com/rock-forge" className="underline underline-offset-4 hover:text-white">rock-forge</a>.
            {" "}The bot and dashboard source are available under the{" "}
            <a href="https://github.com/rock-forge/Kreo/blob/HEAD/LICENSE" className="underline underline-offset-4 hover:text-white">project license</a>.
            {" "}Normal noncommercial use is permitted under that license. Commercial use, resale, and public redistribution of modified versions require rock-forge&apos;s written permission.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="kreo-chip kreo-focus rounded-full px-4 py-2 text-sm font-medium text-white transition hover:border-secondary/30 hover:bg-secondary/10"
            >
              Back to home
            </Link>
            <Link
              href="/privacy"
              className="kreo-chip kreo-focus rounded-full border-secondary/20 bg-secondary/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-secondary/15"
            >
              Privacy Policy
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
