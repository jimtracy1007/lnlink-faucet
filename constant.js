const BTC_ID = "0x000000000000000000000000000000000000000";
const ASSET_TYPE = {
  BTC: "BTC",
  TAPROOT: "TAPROOT",
  RGB: "RGB",
};

const CAN_CLAIM_ASSETS = [
  {
    assetType: ASSET_TYPE.BTC,
    assetId: BTC_ID,
    assetName: "BTC",
    amount: 1000000,
    decimals: 8,
  },
  {
    assetType: ASSET_TYPE.TAPROOT,
    assetId: "f7ac99f2c068f1157c787012f50cb043437505c309c6d8685e135cd8481b1e9d",
    assetName: "USDT",
    amount: 10 * 100,
    decimals: 2,
  },
  {
    assetType: ASSET_TYPE.RGB,
    assetId: "rgb:cJ9fWFzO-snphAel-MC_HNrv-bp7s~n7-QqShKI5-LgA8Wys",
    assetName: "RGB018",
    amount: 10 * 100,
    decimals: 2,
  },
];
module.exports = {
  BTC_ID,
  ASSET_TYPE,
  CAN_CLAIM_ASSETS,
};
