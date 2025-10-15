const { PrismaClient } = require("@prisma/client");
const Logger = require("../logger");
const { nip04, nip19 } = require("nostr-tools");
const prisma = new PrismaClient();
const logger = new Logger("lnlink-identity-service");

class LnlinkIdentityServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "LnlinkIdentityServiceError";
    this.status = status;
  }
}

class LnlinkIdentityService {
  async registerIdentity({
    nostrAddress: rawNostrAddress,
    lnlinkNpub: rawLnlinkNpub,
    signature,
    nodeType,
  }) {
    const nostrAddress = this.normalize(rawNostrAddress);
    const lnlinkNpub = this.normalize(rawLnlinkNpub);

    if (!nostrAddress) {
      throw new LnlinkIdentityServiceError("Invalid nostr address");
    }

    if (!lnlinkNpub) {
      throw new LnlinkIdentityServiceError("Invalid lnlink npub");
    }

    await this.ensureNoConflicts({ nostrAddress, lnlinkNpub });

    if (!signature) {
      throw new LnlinkIdentityServiceError("Invalid signature");
    }
    try {
      const sk = process.env.LNLINK_OWNER_SK;
      const pubkey = nip19.decode(lnlinkNpub).data;
      const decryptContent = await nip04.decrypt(sk, pubkey, signature);
      const formatDecrypt = JSON.parse(decryptContent);
      if (formatDecrypt.nostrAddress !== nostrAddress) {
        throw new LnlinkIdentityServiceError("Invalid signature");
      }
    } catch (error) {
      throw new LnlinkIdentityServiceError("Invalid signature");
    }
    const identity = await prisma.lnlinkIdentity.upsert({
      where: {
        nostrAddress,
      },
      update: {
        lnlinkNpub,
        nodeType: nodeType ? nodeType.trim() : null,
      },
      create: {
        nostrAddress,
        lnlinkNpub,
        nodeType: nodeType ? nodeType.trim() : null,
      },
    });

    logger.info("Lnlink identity stored", {
      nostrAddress: identity.nostrAddress,
      lnlinkNpub: identity.lnlinkNpub,
      nodeType: identity.nodeType,
    });

    return identity;
  }

  async listIdentities() {
    return prisma.lnlinkIdentity.findMany({
      select: {
        id: true,
        nostrAddress: true,
        lnlinkNpub: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getLnlinkNpubByNostr(nostrAddress) {
    if (!this.normalize(nostrAddress)) {
      throw new LnlinkIdentityServiceError("Invalid nostr address");
    }

    const identity = await prisma.lnlinkIdentity.findUnique({
      where: {
        nostrAddress,
      },
      select: {
        lnlinkNpub: true,
      },
    });

    if (!identity) {
      throw new LnlinkIdentityServiceError("Identity not found", 404);
    }

    return identity.lnlinkNpub;
  }

  async ensureNoConflicts({ nostrAddress, lnlinkNpub }) {
    const existingByNostr = await prisma.lnlinkIdentity.findUnique({
      where: {
        nostrAddress,
      },
    });

    if (existingByNostr && existingByNostr.lnlinkNpub !== lnlinkNpub) {
      throw new LnlinkIdentityServiceError(
        "Nostr address already bound to another npub",
        409
      );
    }

    const existingByNpub = await prisma.lnlinkIdentity.findUnique({
      where: {
        lnlinkNpub,
      },
    });

    if (existingByNpub && existingByNpub.nostrAddress !== nostrAddress) {
      throw new LnlinkIdentityServiceError(
        "lnlink npub already bound to another nostr address",
        409
      );
    }
  }

  normalize(value) {
    if (!value || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

const lnlinkIdentityService = new LnlinkIdentityService();

module.exports = {
  lnlinkIdentityService,
  LnlinkIdentityServiceError,
};
