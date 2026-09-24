/**
 * Creates (or promotes) the first super admin.
 *   ADMIN_EMAIL=you@org.com ADMIN_PASSWORD='Str0ngPass' ADMIN_NAME='Jane Doe' npm run db:seed-admin
 */
import { eq } from 'drizzle-orm';
import { db, sqlClient } from '../src/db/client.js';
import { userSettings, users } from '../src/db/schema/index.js';
import { hashPassword } from '../src/lib/password.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME ?? 'Platform Admin';
if (!email || !password || password.length < 8) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters)');

const now = new Date().toISOString();
const [existing] = await db.select().from(users).where(eq(users.email, email));
if (existing) {
  await db.update(users).set({ platformRole: 'super_admin', emailVerifiedAt: existing.emailVerifiedAt ?? now }).where(eq(users.id, existing.id));
  console.log(`Promoted ${email} to super_admin`);
} else {
  const [u] = await db
    .insert(users)
    .values({ email, fullName, passwordHash: await hashPassword(password), passwordChangedAt: now, emailVerifiedAt: now, platformRole: 'super_admin', onboardingCompletedAt: now, acceptedTermsAt: now, username: 'admin' })
    .returning();
  await db.insert(userSettings).values({ userId: u!.id });
  console.log(`Created super_admin ${email}`);
}
await sqlClient.end();
