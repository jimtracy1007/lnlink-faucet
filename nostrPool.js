const {
  nip04,
  finishEvent: finalizeEvent,
  SimplePool,
  getPublicKey,
  nip19,
} = require("nostr-tools");
const ws = require("ws");
const Logger = require("./logger");

globalThis.WebSocket = ws;
const dayjs = require("dayjs");

// Enhanced pool configuration with better connection management
const pool = new SimplePool({
  getTimeout: 30 * 1000,
  // Add connection verification options
  verifyEvent: true,
  // Ensure proper cleanup
  seenOnEnabled: true,
});

let relays = null;

function getRelays() {
  if (!relays) {
    const { LINK_NOSTR_RELAY_URI } = process.env;
    if (!LINK_NOSTR_RELAY_URI) {
      throw new Error("LINK_NOSTR_RELAY_URI configuration not available");
    }
    try {
      relays = JSON.parse(LINK_NOSTR_RELAY_URI);
      if (!Array.isArray(relays)) {
        throw new Error("LINK_NOSTR_RELAY_URI must be a JSON array");
      }
    } catch (error) {
      throw new Error(`Invalid LINK_NOSTR_RELAY_URI format: ${error.message}`);
    }
  }
  return relays;
}

async function buildEvent({
  message,
  kind = 4,
  targetPubkey,
  privateKey,
  tags,
}) {
  if (!message) {
    throw new Error("No message provided.");
  }
  let ciphertext = "";
  if (kind === 4 || kind === 23195 || kind === 24133) {
    ciphertext = await nip04.encrypt(privateKey, targetPubkey, message);
  } else {
    ciphertext = message;
  }
  const created_at = dayjs().unix();
  const event = {
    content: ciphertext,
    kind,
    tags,
    created_at,
  };

  return finalizeEvent(event, privateKey);
}

async function sendMessage({ message, kind = 4 }) {
  const { SEND_TO_NOSTR_ADDR, LNLINK_OWNER_SK } = process.env;
  const encodeSendTo = nip19.decode(SEND_TO_NOSTR_ADDR)?.data;

  const tags = SEND_TO_NOSTR_ADDR
    ? [
        ["p", encodeSendTo],
        ["r", "json"],
      ]
    : [];
  const event = await buildEvent({
    message,
    kind,
    targetPubkey: encodeSendTo,
    privateKey: LNLINK_OWNER_SK,
    tags,
  });

  await Promise.any(pool.publish(getRelays(), event));

  const p = getPublicKey(LNLINK_OWNER_SK);

  const filter = {
    since: event.created_at - 100,
    kinds: [4],
    "#e": [event.id],
    "#p": [p],
  };
  const logger = new Logger("nostr");
  const retEvent = await pool
    .get(getRelays(), filter, { maxWait: 5000 })
    .catch((e) => {
      logger.error(`e.message----> ${e?.message}`);
      return null;
    });

  if (!retEvent) {
    return null;
  }
  const content = retEvent.content;
  let result = null;
  const decryptContent = await nip04
    .decrypt(LNLINK_OWNER_SK, encodeSendTo, content)
    .catch((e) => {
      logger.error(`decryptContent error ${e?.message}`);
    });

  if (decryptContent) {
    try {
      result = JSON.parse(decryptContent);
    } catch (error) {
      logger.error(`execSendMessageAndReturn ~ error: ${error?.message}`);
      return null;
    }
    return result;
  }
}

function publish(newEvent) {
  return pool.publish(getRelays(), newEvent);
}

module.exports = {
  getRelays,
  pool,
  publish,
  sendMessage,
};
