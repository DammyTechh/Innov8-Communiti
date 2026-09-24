import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import {
  clientKind,
  memberRole,
  messagePermission,
  otpPurpose,
  platformRole,
  profileVisibility,
  themePref,
  userStatus,
} from './enums.js';

export const users = pgTable(
  'users',
  {
    id: pk(),
    email: text().notNull(), // always stored lower-cased
    emailVerifiedAt: ts(),
    passwordHash: text(),
    passwordChangedAt: ts(),
    googleId: text(),
    username: text(),
    fullName: text().notNull(),
    avatarUrl: text(),
    coverUrl: text(),
    headline: text(),
    bio: text(),
    memberRole: memberRole(),
    platformRole: platformRole().notNull().default('member'),
    status: userStatus().notNull().default('active'),
    statusReason: text(),
    statusUntil: ts(),
    dateOfBirth: date({ mode: 'string' }),
    country: text(),
    openToCollaborate: boolean().notNull().default(false),
    onboardingCompletedAt: ts(),
    acceptedTermsAt: ts(),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: ts(),
    lastLoginAt: ts(),
    lastSeenAt: ts(),
    followerCount: integer().notNull().default(0),
    followingCount: integer().notNull().default(0),
    postCount: integer().notNull().default(0),
    collaborationCount: integer().notNull().default(0),
    deletionScheduledFor: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_username_key').on(sql`lower(${t.username})`),
    uniqueIndex('users_google_id_key').on(t.googleId),
    index('users_status_idx').on(t.status),
    index('users_created_at_idx').on(t.createdAt),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: themePref().notNull().default('system'),
  language: text().notNull().default('en'),
  profileVisibility: profileVisibility().notNull().default('public'),
  messagePermission: messagePermission().notNull().default('everyone'),
  showOnlineStatus: boolean().notNull().default(true),
  notificationPrefs: jsonb()
    .$type<Record<string, { inApp: boolean; push: boolean; email: boolean }>>()
    .notNull()
    .default({}),
  ...timestamps(),
});

export const topics = pgTable('topics', {
  id: pk(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
});

export const userInterests = pgTable(
  'user_interests',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index('follows_following_idx').on(t.followingId),
    check('follows_not_self', sql`${t.followerId} <> ${t.followingId}`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the current refresh token. Rotated in place on every refresh. */
    refreshTokenHash: text().notNull(),
    /** SHA-256 of the previous token: presenting it again (outside a short grace window) signals theft. */
    previousRefreshTokenHash: text(),
    client: clientKind().notNull().default('unknown'),
    userAgent: text(),
    ip: text(),
    expiresAt: ts().notNull(),
    lastUsedAt: ts(),
    rotatedAt: ts(),
    revokedAt: ts(),
    revokedReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_refresh_token_hash_key').on(t.refreshTokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_previous_hash_idx').on(t.previousRefreshTokenHash),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: pk(),
    email: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    purpose: otpPurpose().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: ts(),
    expiresAt: ts().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_lookup_idx').on(t.email, t.purpose, t.createdAt)],
);

export const searchHistory = pgTable(
  'search_history',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    query: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('search_history_user_idx').on(t.userId, t.createdAt)],
);
