/**
 * `zap pay` command directory, auto-discovered by the CLI dispatcher.
 *
 * Subcommands:
 *   zap pay status [--json]     payer mode: byok | managed | missing
 *   zap pay login --managed     wallet auth + scoped session key (0600)
 *   zap pay logout              clear only the managed session key
 *   zap pay quote [--json]      quote the gate price without paying
 *
 * Plan-only stays the default everywhere; nothing here spends without an
 * explicit payment. Session keys and BYOK keys are never printed.
 */
import { payStatus } from "./status.js";
import { payLogin } from "./login.js";
import { payLogout } from "./logout.js";
import { payQuote } from "./quote.js";

export default {
  name: "pay",
  description: "Payer status, managed wallet login/logout, and payment quotes.",
  subcommands: {
    status: payStatus,
    login: payLogin,
    logout: payLogout,
    quote: payQuote,
  },
  async run(args, io) {
    const [sub, ...rest] = args;
    const command = this.subcommands[sub];
    if (!command) {
      io.error(`Unknown pay subcommand "${sub ?? ""}". Try: status, login, logout, quote.`);
      return 2;
    }
    return command(rest, io);
  },
};
