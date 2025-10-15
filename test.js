const {nip04, nip19,getPublicKey} = require("nostr-tools");
//const prive_key="451e4c0a3db3f77493c83d6a490ef4a594d9435164470ea7313ff8f8a6c8e2a5"
const owner_npub = "npub1q7amuklx0fjw76dtulzzhhjmff8du5lyngw377d89hhrmj49w48ssltn7y"
const npub_pk = nip19.decode(owner_npub).data
console.log("🚀 ~ npub_pk:", npub_pk)
