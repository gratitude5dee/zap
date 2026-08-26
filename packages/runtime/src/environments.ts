/**
 * Host environment profiles: which machine substrate a tenant runtime lives
 * on. The runtime itself (zap-agentd, /zap/fs, the lane stack) is identical
 * in all three — only the substrate differs, so everything above this module
 * works against the profile instead of hardcoding Ubuntu paths.
 *
 * - ubuntu:  the default Box template. Fastest to start, most tested.
 * - omarchy: the same Box, forked from packages/templates/env-omarchy: an
 *            Arch userland running the Omarchy Hyprland desktop, where the
 *            runtime's headed browser lives. Box has no base-image selector,
 *            so Arch is the userland, not the image.
 * - macos:   a Namespace Apple-silicon macOS instance driven over the
 *            env-macos control bridge — native, not containerised, so there
 *            is no provider exec RPC; the bridge on 8722 is the exec path.
 */

export const HOST_ENVIRONMENTS = ["ubuntu", "omarchy", "macos"] as const;

export type HostEnvironment = (typeof HOST_ENVIRONMENTS)[number];

export const DEFAULT_ENVIRONMENT: HostEnvironment = "ubuntu";

export type EnvironmentProvider = "box" | "namespace";

/**
 * How the caller-side kernel reaches the environment:
 * - box:    the Box commands/files API.
 * - native: the env-macos bridge over ingress — Namespace's CommandService
 *           only runs commands in containers, so macOS has no exec RPC.
 */
export type EnvironmentKind = "box" | "native";

export function isHostEnvironment(value: unknown): value is HostEnvironment {
  return typeof value === "string" && (HOST_ENVIRONMENTS as readonly string[]).includes(value);
}

export function toHostEnvironment(value: unknown): HostEnvironment {
  return isHostEnvironment(value) ? value : DEFAULT_ENVIRONMENT;
}

export interface HostEnvironmentProfile {
  environment: HostEnvironment;
  provider: EnvironmentProvider;
  kind: EnvironmentKind;
  label: string;
  blurb: string;
  /** home of the runtime user; every ~/.zap path is relative to it */
  homeDir: string;
  /** services a per-runtime secret merge has to bounce to take effect */
  services: readonly string[];
  /** whether the environment has a desktop for a headed browser */
  headedBrowser: boolean;
  /** listed but not yet selectable — no template registered */
  comingSoon: boolean;
}

/** zap-host re-registers the hosted routes after a resume; Box-only. */
const BOX_SERVICES = ["zap-agentd", "zap-host"] as const;

/** Omarchy adds the desktop the runtime's browser lives on. */
const OMARCHY_SERVICES = [...BOX_SERVICES, "omarchy-desktop"] as const;

/** Namespace publishes ports declaratively, so it needs no host unit. */
const NATIVE_SERVICES = ["zap-agentd"] as const;

export const ENVIRONMENT_PROFILES: Record<HostEnvironment, HostEnvironmentProfile> = {
  ubuntu: {
    environment: "ubuntu",
    provider: "box",
    kind: "box",
    label: "Ubuntu",
    blurb: "Linux runtime. The default — fastest to start, most tested.",
    homeDir: "/home/user",
    services: BOX_SERVICES,
    headedBrowser: true,
    comingSoon: false,
  },
  omarchy: {
    environment: "omarchy",
    provider: "box",
    kind: "box",
    label: "Omarchy",
    blurb: "Arch Linux with the Hyprland desktop. Same tools, tiling desktop.",
    homeDir: "/home/user",
    services: OMARCHY_SERVICES,
    headedBrowser: true,
    comingSoon: true,
  },
  macos: {
    environment: "macos",
    provider: "namespace",
    kind: "native",
    label: "macOS",
    blurb: "A real Apple-silicon Mac. Mac-only apps, screen sharing built in.",
    homeDir: "/Users/zap",
    services: NATIVE_SERVICES,
    headedBrowser: true,
    comingSoon: true,
  },
};

export function profileFor(environment: HostEnvironment): HostEnvironmentProfile {
  return ENVIRONMENT_PROFILES[environment];
}

export function providerFor(environment: HostEnvironment): EnvironmentProvider {
  return ENVIRONMENT_PROFILES[environment].provider;
}

/** Box-hosted environments, i.e. the ones that fork a template box. */
export function isBoxEnvironment(environment: HostEnvironment): boolean {
  return providerFor(environment) === "box";
}

export function kindFor(environment: HostEnvironment): EnvironmentKind {
  return ENVIRONMENT_PROFILES[environment].kind;
}

export function zapPath(environment: HostEnvironment, relative: string): string {
  return `${profileFor(environment).homeDir}/.zap/${relative}`;
}

/**
 * Restart command for a set of services: systemd on a box (both Linux
 * environments), launchd on macOS, where the units are per-user
 * LaunchAgents labelled tech.wzrd.zap.<service>.
 */
export function restartCommand(
  environment: HostEnvironment,
  services: readonly string[] = profileFor(environment).services,
): string {
  const wanted = services.filter((service) => profileFor(environment).services.includes(service));
  if (wanted.length === 0) return "true";
  switch (kindFor(environment)) {
    case "box":
      return `sudo systemctl restart ${wanted.join(" ")}`;
    case "native":
      return wanted
        .map((service) => `launchctl kickstart -k "gui/$(id -u)/tech.wzrd.zap.${service}"`)
        .join(" && ");
  }
}
