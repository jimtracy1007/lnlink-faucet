const { PrismaClient } = require("@prisma/client");
const Logger = require("../logger");

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
