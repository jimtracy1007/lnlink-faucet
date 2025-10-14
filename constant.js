const BTC_ID = "0x000000000000000000000000000000000000000";
const ASSET_TYPE = {
  BTC_TAPROOT: "BTC_TAPROOT",
  BTC_RGB: "BTC_RGB",
  TAPROOT: "TAPROOT",
  RGB: "RGB",
};

const CAN_CLAIM_ASSETS = [
  {
    assetType: ASSET_TYPE.BTC_TAPROOT,
    assetId: BTC_ID,
    assetName: "BTC",
    amount: 1000000,
    decimals: 8,
  },
  {
    assetType: ASSET_TYPE.BTC_RGB,
    assetId: BTC_ID,
    assetName: "BTC",
    amount: 1000000,
    decimals: 8,
  },
  {
    assetType: ASSET_TYPE.TAPROOT,
    assetId: "1fdab5d00433cefae990dab0f4afd7c0cd542c6f51e0ab01168d3c7069320a5b",
    assetName: "TEST",
    amount: 1000 * 100,
    decimals: 2,
  },
  {
    assetType: ASSET_TYPE.RGB,
    assetId: "rgb:ZbpeabIn-Wq80C9k-FsjcbkF-rx34LIv-joDSJbG-CRKzuEU",
    assetName: "LINKRGB",
    amount: 1000 * 100,
    decimals: 2,
  },
];
module.exports = {
  BTC_ID,
  ASSET_TYPE,
  CAN_CLAIM_ASSETS,
};
