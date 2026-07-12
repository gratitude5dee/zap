/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as feedback from "../feedback.js";
import type * as lib_publicRun from "../lib/publicRun.js";
import type * as lib_serviceAuth from "../lib/serviceAuth.js";
import type * as poller from "../poller.js";
import type * as runs from "../runs.js";
import type * as sprites from "../sprites.js";
import type * as zaps from "../zaps.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  feedback: typeof feedback;
  "lib/publicRun": typeof lib_publicRun;
  "lib/serviceAuth": typeof lib_serviceAuth;
  poller: typeof poller;
  runs: typeof runs;
  sprites: typeof sprites;
  zaps: typeof zaps;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
