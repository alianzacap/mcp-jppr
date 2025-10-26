import { jwtVerify, createRemoteJWKSet } from 'jose';

interface ValidatedToken {
  sub: string;
  scope: string;
  azp: string;
  gty: string;
  aud: string | string[];
  [key: string]: any; // Allow additional properties from JWT
}

export async function validateAuth0Token(
  token: string,
  domain: string,
  audience: string
): Promise<ValidatedToken> {
  const jwksUrl = `https://${domain}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${domain}/`,
    audience: audience,
  });

  return payload as ValidatedToken;
}

