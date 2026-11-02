const { Player, Rest, Constants } = require("shoukaku");
const { State } = Constants;
const recoveryAttempts = new WeakMap();
const RECOVERY_INTERVAL_MS = 5000;

function expiredSessionId(error) {
  if (error?.status !== 404 || typeof error.message !== "string" || error.message.trim().toLowerCase() !== "session not found") return null;
  return /^\/v4\/sessions\/([^/?#]+)(?:\/players(?:\/\d{17,20})?)?\/?$/.exec(error.path || "")?.[1] || null;
}

function recoverLavalinkSession(client, error, sourceNode) {
  const sessionId = expiredSessionId(error);
  if (!sessionId) return false;
  const nodes = client.manager?.shoukaku?.nodes;
  const node = typeof sourceNode === "string" ? nodes?.get(sourceNode) : sourceNode ||
    [...(nodes?.values() || [])].find(candidate => candidate.sessionId === sessionId);

  // A late response from an expired session must never reset a replacement session.
  if (!node || (nodes && nodes.get(node.name) !== node) || node.sessionId !== sessionId) return true;
  const previous = recoveryAttempts.get(node);
  const delay = previous ? RECOVERY_INTERVAL_MS - (Date.now() - previous.at) : 0;
  if (delay > 0) {
    previous.sessionId = sessionId;
    if (!previous.timer) {
      previous.timer = setTimeout(() => {
        previous.timer = null;
        recoverLavalinkSession(client, { status: 404, message: "Session not found", path: `/v4/sessions/${previous.sessionId}` }, node);
      }, delay);
      previous.timer.unref?.();
    }
    return true;
  }
  if (previous?.timer) clearTimeout(previous.timer);
  recoveryAttempts.set(node, { at: Date.now(), sessionId, timer: null });
  node.sessionId = null;
  client.logger?.log(`Lavalink "${node.name}" session expired. Reconnecting and retaining players for recovery.`, "warn");
  try {
    if (node.state === State.CONNECTED) {
      node.disconnect(1000, "Expired Lavalink session");
    } else if (node.state === State.DISCONNECTED) {
      Promise.resolve(node.connect()).catch(recoveryError => {
        client.logger?.log(`Lavalink "${node.name}" session recovery failed: ${recoveryError.message}`, "error");
      });
    }
  } catch (recoveryError) {
    client.logger?.log(`Lavalink "${node.name}" session recovery failed: ${recoveryError.message}`, "error");
  }
  return true;
}

function sessionRecoveryStructures(client, structures = {}) {
  const BaseRest = structures.rest || Rest;
  const BasePlayer = structures.player || Player;
  return {
    ...structures,
    rest: class RecoveringRest extends BaseRest {
      async fetch(options) {
        try { return await super.fetch(options); }
        catch (error) {
          recoverLavalinkSession(client, error, this.node);
          throw error;
        }
      }
    },
    player: class RecoveringPlayer extends BasePlayer {
      async sendServerUpdate(connection) {
        try { return await super.sendServerUpdate(connection); }
        catch (error) {
          // Initial joins must still reject, so Kazagumo can detach their failed connection.
          if (this.node.manager.players.get(this.guildId) !== this) throw error;
          // Kazagumo dispatches later voice updates without awaiting their promise.
          if (!recoverLavalinkSession(client, error, this.node)) {
            this.node.manager.emit("error", this.node.name, error);
          }
        }
      }
    },
  };
}

module.exports = { expiredSessionId, recoverLavalinkSession, sessionRecoveryStructures };
