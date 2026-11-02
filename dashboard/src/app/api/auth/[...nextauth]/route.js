import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { refreshDiscordToken } from "@/lib/discordToken";

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: runtimeConfig.dashboard.clientId,
      clientSecret: runtimeConfig.dashboard.clientSecret,
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? Number(account.expires_at) * 1000
          : Date.now() + Number(account.expires_in || 3600) * 1000;
        token.error = undefined;
      }
      if (profile) {
        token.id = profile.id;
      }
      if (Date.now() < Number(token.accessTokenExpires) - 60_000) return token;
      return refreshDiscordToken(token, runtimeConfig.dashboard);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  secret: runtimeConfig.dashboard.nextAuthSecret,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
