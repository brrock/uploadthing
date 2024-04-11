const signaturePrefix = "hmac-sha256=";
const algorithm = { name: "HMAC", hash: "SHA-256" };

export const signPayload = async (payload: string, secret: string) => {
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    algorithm,
    false,
    ["sign"],
  );

  const signature = await crypto.subtle
    .sign(algorithm, signingKey, encoder.encode(payload))
    .then((sig) => Buffer.from(sig).toString("hex"));

  return `${signaturePrefix}${signature}`;
};

export const verifySignature = async (
  payload: string,
  signature: string | null,
  secret: string,
) => {
  const sig = signature?.slice(signaturePrefix.length);
  if (!sig) return false;

  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    algorithm,
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    algorithm,
    signingKey,
    Uint8Array.from(Buffer.from(sig, "hex")),
    encoder.encode(payload),
  );
};
