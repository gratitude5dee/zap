import type { Context } from "./types.ts";

/**
 * Class-shaped plugin: constructing a Service registers a start effect and
 * provides the instance under `key`; `stop` (when defined) is its inverse.
 */
export abstract class Service {
  protected readonly ctx: Context;
  readonly key: string;

  constructor(ctx: Context, key: string) {
    this.ctx = ctx;
    this.key = key;
    void ctx.effect(async () => {
      await this.start();
      const withdraw = ctx.provide(key, this);
      return async () => {
        withdraw();
        if (this.stop) await this.stop();
      };
    });
  }

  protected abstract start(): void | Promise<void>;
  protected stop?(): void | Promise<void>;
}
