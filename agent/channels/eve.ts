import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    httpBasic({
      username: process.env.ZAP_BASIC_USER ?? "zap",
      password: process.env.ZAP_BASIC_PASSWORD ?? "",
    }),
    vercelOidc(),
    localDev(),
  ],
});
