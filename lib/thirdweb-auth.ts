import "server-only";

import { createThirdwebClient } from "thirdweb";
import { createAuth } from "thirdweb/auth";
import { publicZapOrigin } from "./zap-urls";
import { resolveThirdwebServerClientOptions } from "./thirdweb-client-options";
import { ZAP_LOGIN_STATEMENT } from "./wallet-siwe";

export function getThirdwebAuth() {
  const origin = publicZapOrigin();
  const url = new URL(origin);
  const client = createThirdwebClient(resolveThirdwebServerClientOptions());
  return {
    auth: createAuth({
      client,
      domain: url.host,
      login: {
        payloadExpirationTimeSeconds: 60 * 10,
        statement: ZAP_LOGIN_STATEMENT,
        uri: origin,
        version: "1",
      },
    }),
    domain: url.host,
    origin,
  };
}
