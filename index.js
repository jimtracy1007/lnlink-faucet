require("dotenv").config();
const express = require("express");
const Logger = require("./logger");
const faucetService = require("./faucetService");
const { CAN_CLAIM_ASSETS } = require("./constant");
const { startWorker } = require("./tasks/confirmationWorker");

const app = express();
const logger = new Logger("api");

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
  });
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get available assets for claiming
app.get("/api/assets", (req, res) => {
  try {
    const assets = CAN_CLAIM_ASSETS.map((asset) => ({
      assetType: asset.assetType,
      assetId: asset.assetId,
      assetName: asset.assetName,
      amount: asset.amount,
      decimals: asset.decimals,
    }));

    res.json({
      code: 0,
      data: { assets },
      message: "success",
    });
  } catch (error) {
    logger.error("Get assets API error", error.message);
    res.status(500).json({
      code: 500,
      data: null,
      message: error.message,
    });
  }
});

// Claim faucet
app.post("/api/claim", async (req, res) => {
  try {
    const { nostrAddress, assetType, addressOrinvoice, assetName, assetId } =
      req.body;

    const result = await faucetService.processClaim({
      nostrAddress,
      assetType,
      invoice: addressOrinvoice,
      assetName,
      assetId,
    });

    res.json({
      code: 0,
      data: result,
      message: "success",
    });
  } catch (error) {
    logger.error("Claim API error", error.message);
    res.status(400).json({
      code: 500,
      data: null,
      message: error.message,
    });
  }
});

// Get claim history for a user
app.get("/api/history", async (req, res) => {
  try {
    const { nostrAddress } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    const history = await faucetService.getClaimHistory(nostrAddress, limit);

    res.json({
      code: 0,
      data: { history },
      message: "success",
    });
  } catch (error) {
    logger.error("History API error", error.message);
    res.status(500).json({
      code: 500,
      data: null,
      message: error.message,
    });
  }
});

// Get all claims (admin endpoint)
app.get("/api/admin/claims", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;

    const result = await faucetService.getAllClaims(page, pageSize);

    res.json({
      code: 0,
      data: result,
      message: "success",
    });
  } catch (error) {
    logger.error("Admin claims API error", error.message);
    res.status(500).json({
      code: 500,
      data: null,
      message: error.message,
    });
  }
});

// Check if user can claim specific asset
app.get("/api/can-claim", async (req, res) => {
  try {
    const { nostrAddress, assetId, assetType } = req.query;
    const result = await faucetService.canClaim(
      nostrAddress,
      assetId,
      assetType
    );

    res.json({
      code: 0,
      data: result,
      message: "success",
    });
  } catch (error) {
    logger.error("Can claim API error", error.message);
    res.status(500).json({
      code: 500,
      data: null,
      message: error.message,
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", err.message);
  res.status(500).json({
    code: 500,
    data: null,
    message: "Internal server error",
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Faucet server started on port ${PORT}`);
  startWorker();
});
