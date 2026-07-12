type ThirdwebEnvironment = Readonly<Record<string, string | undefined>>;

export type ThirdwebServerClientOptions =
  | { readonly secretKey: string }
  | { readonly clientId: string };

export function resolveThirdwebServerClientOptions(
  env: ThirdwebEnvironment = process.env,
): ThirdwebServerClientOptions {
  const secretKey = env.THIRDWEB_SECRET_KEY?.trim();
  if (secretKey) return { secretKey };

  const clientId = env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim();
  if (clientId) return { clientId };

  throw new Error(
    "THIRDWEB_SECRET_KEY or NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required for wallet sign-in.",
  );
}
