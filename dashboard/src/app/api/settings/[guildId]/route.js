import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { fetchDiscordGuilds, getGuildAccess } from "@/lib/discordAccess";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { runtimeConfig } from "@/lib/runtimeConfig";

// Dynamically import Mongoose to avoid schema conflicts in serverless
import mongoose from "mongoose";

const MAX_VOLUME = 100;
const MIN_VOLUME = 1;

// Define schemas locally or import them
const autoReconnectSchema = new mongoose.Schema({
  Guild: { type: String, required: true },
  TextId: { type: String, required: true },
  VoiceId: { type: String, required: true },
});

const prefixSchema = new mongoose.Schema({
  Guild: String,
  Prefix: String,
  oldPrefix: String,
  Volume: Number,
});

const logsSchema = new mongoose.Schema({
  Guild: { type: String, required: true },
  Channel: { type: String, required: true },
});

const voiceRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  roleId: { type: String, required: false },
});

const ignoreChannelSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
});

async function notifyBot(guildId, type) {
  try {
    const botApiUrl = runtimeConfig.dashboard.botApiUrl || "http://localhost:2000";
    await fetch(`${botApiUrl}/api/settings/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(runtimeConfig.dashboard.bridgeSecret
          ? { "x-kreo-bridge-secret": runtimeConfig.dashboard.bridgeSecret }
          : {}),
      },
      body: JSON.stringify({ guildId, type })
    });
  } catch (e) {
    console.error("Failed to notify bot bridge", e);
  }
}

function clampVolume(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 80;
  }

  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, Math.round(numericValue)));
}

export async function GET(req, { params }) {
  const resolvedParams = await params;
  const guildId = resolvedParams?.guildId;
  
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }
  
  try {
    await dbConnect();
    
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let guilds = [];
    try {
      guilds = await fetchDiscordGuilds(session.accessToken);
    } catch (error) {
      console.error(`Failed to fetch Discord guilds for ${guildId}`, error);
      return NextResponse.json({ error: "Failed to verify guild access" }, { status: 502 });
    }

    const access = getGuildAccess(guilds, guildId);
    if (!access.isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Register models if not already registered - Matching Bot's model names exactly
    const AutoReconnect = mongoose.models.autoreconnect || mongoose.model("autoreconnect", autoReconnectSchema);
    const Prefix = mongoose.models.prefix || mongoose.model("prefix", prefixSchema);
    const Logs = mongoose.models.Logs || mongoose.model("Logs", logsSchema);
    const VoiceRole = mongoose.models.VoiceRole || mongoose.model("VoiceRole", voiceRoleSchema);
    const IgnoreChannel = mongoose.models.ignorechannel || mongoose.model("ignorechannel", ignoreChannelSchema);

    const [auto247, prefixData, logsData, voiceRoleData, ignoreChannelsData] = await Promise.all([
      AutoReconnect.findOne({ Guild: guildId }),
      Prefix.findOne({ Guild: guildId }),
      Logs.findOne({ Guild: guildId }),
      VoiceRole.findOne({ guildId: guildId }),
      IgnoreChannel.find({ guildId: guildId })
    ]);

    return NextResponse.json({
      settings: {
        is247Enabled: !!auto247,
        prefix: prefixData?.Prefix || process.env.BOT_PREFIX || ".",
        volume: clampVolume(prefixData?.Volume || 80),
        voiceChannel: auto247?.VoiceId || "",
        textChannel: auto247?.TextId || "",
        logsChannel: logsData?.Channel || "",
        voiceRole: voiceRoleData?.roleId || "",
        ignoredChannels: ignoreChannelsData.map(c => c.channelId) || [],
      },
      access: {
        isOwner: access.isOwner,
        canViewSettings: access.canManage,
        canEditRestrictedSettings: access.isOwner,
      },
    });
  } catch (error) {
    console.error("Failed to fetch settings", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const resolvedParams = await params;
  const guildId = resolvedParams?.guildId;
  
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const body = await req.json();
  
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let guilds = [];
    try {
      guilds = await fetchDiscordGuilds(session.accessToken);
    } catch (error) {
      console.error(`Failed to fetch Discord guilds for ${guildId}`, error);
      return NextResponse.json({ error: "Failed to verify guild access" }, { status: 502 });
    }

    const access = getGuildAccess(guilds, guildId);
    if (!access.isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const AutoReconnect = mongoose.models.autoreconnect || mongoose.model("autoreconnect", autoReconnectSchema);
    const Prefix = mongoose.models.prefix || mongoose.model("prefix", prefixSchema);
    const Logs = mongoose.models.Logs || mongoose.model("Logs", logsSchema);
    const VoiceRole = mongoose.models.VoiceRole || mongoose.model("VoiceRole", voiceRoleSchema);
    const IgnoreChannel = mongoose.models.ignorechannel || mongoose.model("ignorechannel", ignoreChannelSchema);

    const [existing247, existingVoiceRole] = await Promise.all([
      AutoReconnect.findOne({ Guild: guildId }),
      VoiceRole.findOne({ guildId: guildId }),
    ]);

    const requested247State = Boolean(body.is247Enabled);
    const current247State = Boolean(existing247);
    const requestedVoiceChannel = body.voiceChannel ?? "";
    const currentVoiceChannel = existing247?.VoiceId || "";
    const requestedTextChannel = body.textChannel ?? "";
    const currentTextChannel = existing247?.TextId || "";
    const requestedVoiceRole = body.voiceRole ?? "";
    const currentVoiceRole = existingVoiceRole?.roleId || "";

    const is247Changed =
      body.is247Enabled !== undefined &&
      (
        requested247State !== current247State ||
        (requested247State && (
          requestedVoiceChannel !== currentVoiceChannel ||
          requestedTextChannel !== currentTextChannel
        ))
      );

    const isVoiceRoleChanged =
      body.voiceRole !== undefined &&
      requestedVoiceRole !== currentVoiceRole;

    if (!access.isOwner && (is247Changed || isVoiceRoleChanged)) {
      return NextResponse.json(
        { error: "Only the server owner can change 24/7 mode or voice-role settings." },
        { status: 403 }
      );
    }

    // Update Prefix & Volume
    if (body.prefix !== undefined || body.volume !== undefined) {
      const updateData = { Guild: guildId };
      if (body.prefix !== undefined) updateData.Prefix = body.prefix;
      if (body.volume !== undefined) updateData.Volume = clampVolume(body.volume);
      
      await Prefix.findOneAndUpdate(
        { Guild: guildId },
        updateData,
        { upsert: true, returnDocument: 'after' }
      );
      if (body.prefix !== undefined) await notifyBot(guildId, "prefix");
      if (body.volume !== undefined) await notifyBot(guildId, "volume");
    }

    // Update 24/7 Mode
    if (body.is247Enabled === false) {
      await AutoReconnect.findOneAndDelete({ Guild: guildId });
      await notifyBot(guildId, "247");
    } else if (body.is247Enabled === true) {
      if (!body.voiceChannel || !body.textChannel) {
        return NextResponse.json({ error: "Voice and Text channels are required to enable 24/7 mode." }, { status: 400 });
      }
      await AutoReconnect.findOneAndUpdate(
        { Guild: guildId },
        { Guild: guildId, VoiceId: body.voiceChannel, TextId: body.textChannel },
        { upsert: true, returnDocument: 'after' }
      );
      await notifyBot(guildId, "247");
    }

    // Update Logs
    if (body.logsChannel !== undefined) {
      if (body.logsChannel === "") {
        await Logs.findOneAndDelete({ Guild: guildId });
      } else {
        await Logs.findOneAndUpdate(
          { Guild: guildId },
          { Guild: guildId, Channel: body.logsChannel },
          { upsert: true, returnDocument: 'after' }
        );
      }
    }

    // Update Voice Role
    if (body.voiceRole !== undefined) {
      if (body.voiceRole === "") {
        await VoiceRole.findOneAndDelete({ guildId: guildId });
      } else {
        await VoiceRole.findOneAndUpdate(
          { guildId: guildId },
          { guildId: guildId, roleId: body.voiceRole },
          { upsert: true, returnDocument: 'after' }
        );
      }
    }

    // Update Ignored Channels
    if (body.ignoredChannels !== undefined) {
      await IgnoreChannel.deleteMany({ guildId: guildId });
      if (Array.isArray(body.ignoredChannels) && body.ignoredChannels.length > 0) {
        const ignoreEntries = body.ignoredChannels.map(id => ({ guildId: guildId, channelId: id }));
        await IgnoreChannel.insertMany(ignoreEntries);
      }
    }

    return NextResponse.json({
      success: true,
      access: {
        isOwner: access.isOwner,
        canViewSettings: access.canManage,
        canEditRestrictedSettings: access.isOwner,
      },
    });
  } catch (error) {
    console.error("Failed to update settings", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
