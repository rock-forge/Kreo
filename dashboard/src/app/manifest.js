export default function manifest() {
  return {
    name: "Kreo Dashboard",
    short_name: "Kreo",
    description:
      "A real-time Discord music dashboard for controlling Kreo playback, queue, and server settings.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090f",
    theme_color: "#c2a4ff",
    icons: [
      {
        src: "/branding/kreo-icon-512-v2.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/branding/kreo-icon-192-v2.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
