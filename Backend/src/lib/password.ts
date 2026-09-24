import { hash, verify } from '@node-rs/argon2';

// OWASP 2024 recommendation for Argon2id: m=19 MiB, t=2, p=1.
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, options);

export async function verifyPassword(hashed: string, plain: string) {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/**
 * Used when the email does not exist, so response time does not reveal which
 * emails are registered. The dummy hash is created once per instance.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(plain: string) {
  dummyHash ??= hashPassword('communiti-timing-equaliser');
  await verifyPassword(await dummyHash, plain);
  return false;
}
