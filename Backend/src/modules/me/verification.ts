import { and, count, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { media, memberVerifications, userInterests, users } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMailSafe, templates } from '../../lib/mailer/index.js';
import { httpUrl } from '../../lib/url.js';
import { mediaDto, memberRoleEnum, verificationStatusEnum } from '../_shared/dto.js';
import { assertOwnedReadyMedia, toMediaDtos } from '../_shared/media.js';
import { emailUsers, notify } from '../notifications/notifications.service.js';
import { assessRole, type Assessment, type Subject } from '../verification/engine.js';

/**
 * Onboarding after email verification (Figma: Select Role → role form → One more thing!):
 *   1. PUT /me/role       role + the role's verification form (Researcher, Innovator, Professional, Learner)
 *   2. PUT /me/interests  topics ("Go to Communiti")
 * Onboarding completes as soon as both are done.
 *
 * Role forms are verified automatically on submit (modules/verification/engine.ts): a form that fails any
 * check is refused with 422 VERIFICATION_FAILED and a message per field, and nothing is saved; a form that
 * passes is verified at once (no admin queue). Admins are notified of every new member and can still
 * override a decision from the admin dashboard.
 */

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const link = httpUrl('Enter a valid link, starting with https://').max(500);
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export const researcherDetails = z
  .object({
    institutionalEmail: email.optional().describe('Identity verification: institutional email, e.g. name@university.edu.ng'),
    orcidId: z
      .string()
      .trim()
      .toUpperCase()
      .regex(ORCID, 'Enter your ORCID iD as 0000-0000-0000-0000')
      .optional()
      .describe('Identity verification: ORCID iD (recommended), e.g. 0000-0006-0000-0004'),
    researchProjectLink: link.optional().describe('Research background: research project link'),
    researchEvidence: z.string().trim().max(2000).optional().describe('Research background: evidence of research (brief description)'),
  })
  .refine((d) => d.institutionalEmail || d.orcidId, { message: 'Enter your institutional email or your ORCID iD', path: ['institutionalEmail'] })
  .meta({ id: 'ResearcherDetails' });

export const innovatorDetails = z
  .object({
    ventureName: z.string().trim().min(2, 'Enter your project or venture name').max(120).describe('Project / venture name'),
    description: z.string().trim().max(2000).optional().describe('Short description'),
    developmentStage: z.enum(['open', 'ongoing', 'closed']).describe('Stage of development: Open, Ongoing or Closed'),
    evidenceLink: link.optional().describe('Evidence of work: link to an article, pitch deck or publication'),
    evidenceFileIds: z.array(z.uuid()).max(5).default([]).describe('Evidence of work: uploaded files (purpose `verification`; PDF, PNG, JPEG)'),
    otherCueFileIds: z.array(z.uuid()).max(10).default([]).describe('Other cues: hackathons, boot-camps, patents, awards… (purpose `verification`)'),
  })
  .meta({ id: 'InnovatorDetails' });

export const professionalDetails = z
  .object({
    organizationName: z.string().trim().min(2, 'Enter your organisation name').max(160),
    profileLink: link.optional().describe('LinkedIn or professional profile link'),
    professionalTitle: z.string().trim().min(2, 'Enter your professional title').max(100).describe('e.g. Machinist. Also used as your profile headline if you have none'),
    workEmail: email.optional().describe('Work or institutional email'),
  })
  .meta({ id: 'ProfessionalDetails' });

export const learnerDetails = z
  .object({
    studentEmail: email.optional(),
    institution: z.string().trim().min(2, 'Enter your school or institution').max(160).describe('School / institution'),
    courseOfStudy: z.string().trim().min(2, 'Enter your course or area of study').max(160),
    level: z.string().trim().max(40).optional().describe('Level / year, e.g. 200'),
  })
  .meta({ id: 'LearnerDetails' });

export const roleBody = z
  .discriminatedUnion('memberRole', [
    z.object({ memberRole: z.literal('researcher'), details: researcherDetails }),
    z.object({ memberRole: z.literal('innovator'), details: innovatorDetails }),
    z.object({ memberRole: z.literal('professional'), details: professionalDetails }),
    z.object({ memberRole: z.literal('learner'), details: learnerDetails }),
  ])
  .meta({ id: 'RoleSubmission' });
export type RoleBody = z.infer<typeof roleBody>;

/** Every field any role form can hold; only the chosen role's fields are filled. */
export const verificationDetailsDto = z
  .object({
    institutionalEmail: z.string().optional(),
    orcidId: z.string().optional(),
    researchProjectLink: z.string().optional(),
    researchEvidence: z.string().optional(),
    ventureName: z.string().optional(),
    description: z.string().optional(),
    developmentStage: z.enum(['open', 'ongoing', 'closed']).optional(),
    evidenceLink: z.string().optional(),
    evidenceFileIds: z.array(z.string()).optional(),
    otherCueFileIds: z.array(z.string()).optional(),
    organizationName: z.string().optional(),
    profileLink: z.string().optional(),
    professionalTitle: z.string().optional(),
    workEmail: z.string().optional(),
    studentEmail: z.string().optional(),
    institution: z.string().optional(),
    courseOfStudy: z.string().optional(),
    level: z.string().optional(),
  })
  .meta({ id: 'VerificationDetails' });

export const verificationDto = z
  .object({
    memberRole: memberRoleEnum,
    status: verificationStatusEnum,
    details: verificationDetailsDto,
    files: z.array(mediaDto).describe('Uploaded evidence (signed links, valid 1 hour)'),
    submittedAt: z.string(),
    reviewedAt: z.string().nullable().describe('When the current decision was made'),
    reviewNote: z.string().nullable().describe('Why it was rejected, when rejected'),
    decidedBy: z.enum(['auto', 'admin']).nullable().describe('`auto`: automatic verification on submit · `admin`: an admin decided'),
  })
  .meta({ id: 'Verification' });

export const verificationCheckDto = z
  .object({
    field: z.string().describe('Form field the check is about, or `form`'),
    check: z.string().describe('e.g. orcid_record, email_dns, link_reachable, text_quality'),
    outcome: z.enum(['pass', 'warn', 'fail', 'skipped']).describe('skipped = could not be checked right now (never rejects)'),
    message: z.string(),
    points: z.number(),
  })
  .meta({ id: 'VerificationCheck' });

export const autoChecksDto = z
  .object({
    decision: z.enum(['verified', 'rejected']),
    score: z.number(),
    summary: z.string(),
    networkChecks: z.boolean(),
    checkedAt: z.string(),
    durationMs: z.number(),
    checks: z.array(verificationCheckDto),
  })
  .meta({ id: 'AutoVerification' });

export const onboardingDto = z
  .object({
    complete: z.boolean(),
    nextStep: z.enum(['select_role', 'interests', 'done']).describe('Where to send the member: Select Role, One more thing! (topics), or the app'),
    emailVerified: z.boolean(),
    roleSubmitted: z.boolean(),
    interestsSelected: z.boolean(),
    memberRole: memberRoleEnum.nullable(),
    verificationStatus: verificationStatusEnum,
  })
  .meta({ id: 'OnboardingStatus' });

export async function loadVerification(userId: string): Promise<z.infer<typeof verificationDto> | null> {
  const [v] = await db.select().from(memberVerifications).where(eq(memberVerifications.userId, userId));
  if (!v) return null;
  const rows = v.mediaIds.length ? await db.select().from(media).where(and(eq(media.ownerId, userId), inArray(media.id, v.mediaIds))) : [];
  const dtos = await toMediaDtos(rows);
  return {
    memberRole: v.memberRole,
    status: v.status,
    details: v.details,
    files: v.mediaIds.map((id) => dtos.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m)),
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    reviewNote: v.reviewNote,
    decidedBy: v.decidedBy === 'auto' || v.decidedBy === 'admin' ? v.decidedBy : null,
  };
}

export async function onboardingStatus(userId: string): Promise<z.infer<typeof onboardingDto>> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw Errors.notFound('User');
  const [[interests], [form]] = await Promise.all([
    db.select({ n: count() }).from(userInterests).where(eq(userInterests.userId, userId)),
    db.select({ n: count() }).from(memberVerifications).where(eq(memberVerifications.userId, userId)),
  ]);
  const complete = Boolean(u.onboardingCompletedAt);
  const roleSubmitted = Boolean(u.memberRole) && ((form?.n ?? 0) > 0 || complete);
  const interestsSelected = (interests?.n ?? 0) > 0;
  return {
    complete,
    nextStep: complete ? 'done' : !roleSubmitted ? 'select_role' : interestsSelected ? 'done' : 'interests',
    emailVerified: Boolean(u.emailVerifiedAt),
    roleSubmitted,
    interestsSelected,
    memberRole: u.memberRole,
    verificationStatus: u.verificationStatus,
  };
}

export const roleLabel: Record<string, string> = {
  researcher: 'Researcher',
  innovator: 'Innovator',
  professional: 'Professional',
  learner: 'Learner',
  expert: 'Expert',
  investor: 'Investor',
  student: 'Student',
};

/**
 * Tells every admin (in-app, live, and by email when ADMIN_NEW_MEMBER_EMAILS is on) that a member finished
 * onboarding or changed role, with the automatic verification result. Never throws: a notification problem
 * must not fail the member's request.
 */
export async function notifyAdminsOfMember(userId: string, event: 'onboarded' | 'role_changed') {
  try {
    const [u] = await db
      .select({ fullName: users.fullName, email: users.email, memberRole: users.memberRole, verificationStatus: users.verificationStatus })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) return;
    const [v] = await db.select({ trustScore: memberVerifications.trustScore, autoChecks: memberVerifications.autoChecks }).from(memberVerifications).where(eq(memberVerifications.userId, userId));
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.platformRole, ['admin', 'super_admin']), isNull(users.deletedAt), ne(users.status, 'blocked'), ne(users.id, userId)));
    if (!admins.length) return;
    const role = u.memberRole ? (roleLabel[u.memberRole] ?? u.memberRole) : 'Member';
    const result =
      u.verificationStatus === 'verified'
        ? `verified automatically${v?.trustScore != null ? ` (trust ${v.trustScore}/100)` : ''}`
        : u.verificationStatus === 'unverified'
          ? 'no role form (unverified)'
          : u.verificationStatus;
    const flags = ((v?.autoChecks as { checks?: { outcome: string; check: string }[] } | null)?.checks ?? []).filter((c) => c.outcome === 'warn').map((c) => c.check);
    await notify(
      admins.map((a) => a.id),
      {
        type: 'new_member',
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        title: event === 'onboarded' ? `New member: ${u.fullName}` : `${u.fullName} changed role to ${role}`,
        body: `${role} · ${result}`,
        data: { event, memberRole: u.memberRole, verificationStatus: u.verificationStatus, trustScore: v?.trustScore ?? null, flags },
        push: false,
      },
    );
    if (env.ADMIN_NEW_MEMBER_EMAILS && event === 'onboarded') {
      await emailUsers(
        admins.map((a) => a.id),
        'new_member',
        (a) => templates.newMemberAdmin({ name: a.firstName, member: u.fullName, email: u.email, role, result, userId }),
      );
    }
  } catch (err) {
    logger.error({ err, userId }, '[onboarding] admin notification failed');
  }
}

/**
 * Marks onboarding complete (welcome email + admin notification) once a role and at least one topic are set.
 * The update is conditional, so concurrent requests can't send the emails twice.
 */
export async function completeOnboardingIfReady(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.onboardingCompletedAt || !u.memberRole) return false;
  const [interests] = await db.select({ n: count() }).from(userInterests).where(eq(userInterests.userId, userId));
  if (!interests?.n) return false;
  const done = await db
    .update(users)
    .set({ onboardingCompletedAt: new Date().toISOString() })
    .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)))
    .returning({ id: users.id });
  if (!done.length) return false;
  await sendMailSafe(u.email, templates.welcome({ name: u.fullName.split(' ')[0]! }));
  await notifyAdminsOfMember(userId, 'onboarded');
  return true;
}

/** Another account (not deleted) already backs its verification, or signs in, with this ORCID iD / email. */
async function findDuplicates(userId: string, values: { orcidId?: string; emails: string[] }) {
  const result = { orcidId: false, emails: new Set<string>() };
  const emails = [...new Set(values.emails.map((e) => e.toLowerCase()))];
  if (!values.orcidId && !emails.length) return result;
  const taken = (status: typeof memberVerifications.status) => eq(status, 'verified');
  if (values.orcidId) {
    const [hit] = await db
      .select({ id: memberVerifications.userId })
      .from(memberVerifications)
      .innerJoin(users, eq(users.id, memberVerifications.userId))
      .where(and(sql`(${memberVerifications.details} ->> 'orcidId') = ${values.orcidId}`, ne(memberVerifications.userId, userId), taken(memberVerifications.status), isNull(users.deletedAt)))
      .limit(1);
    result.orcidId = Boolean(hit);
  }
  for (const e of emails) {
    const [inForm] = await db
      .select({ id: memberVerifications.userId })
      .from(memberVerifications)
      .innerJoin(users, eq(users.id, memberVerifications.userId))
      .where(
        and(
          ne(memberVerifications.userId, userId),
          taken(memberVerifications.status),
          isNull(users.deletedAt),
          or(
            sql`lower(${memberVerifications.details} ->> 'institutionalEmail') = ${e}`,
            sql`lower(${memberVerifications.details} ->> 'workEmail') = ${e}`,
            sql`lower(${memberVerifications.details} ->> 'studentEmail') = ${e}`,
          ),
        ),
      )
      .limit(1);
    const [asLogin] = inForm ? [inForm] : await db.select({ id: users.id }).from(users).where(and(eq(users.email, e), ne(users.id, userId), isNull(users.deletedAt))).limit(1);
    if (inForm || asLogin) result.emails.add(e);
  }
  return result;
}

async function subjectOf(userId: string): Promise<Subject> {
  const [u] = await db.select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId));
  if (!u) throw Errors.notFound('User');
  return { userId, fullName: u.fullName, accountEmail: u.email };
}

/** Runs automatic verification for a role form (exported for the admin "recheck" action and the backlog job). */
export async function assessForm(userId: string, body: RoleBody) {
  return assessRole(body, await subjectOf(userId), { findDuplicates });
}

const storedChecks = (a: Assessment) => ({ ...a }) as unknown as Record<string, unknown>;

/**
 * Saves the role and its form after automatic verification. Re-submitting (Settings → "Change my role",
 * "Change this email") replaces the previous form only when the new one passes; a failing form is refused
 * with 422 VERIFICATION_FAILED and the previous form (and badge) stay as they were.
 */
export async function submitRole(req: FastifyRequest, userId: string, body: RoleBody) {
  const details = body.details as Record<string, unknown>;
  const fileIds = body.memberRole === 'innovator' ? [...new Set([...body.details.evidenceFileIds, ...body.details.otherCueFileIds])] : [];
  // Ownership and readiness of evidence files first: a clear 400 before any lookups run.
  await assertOwnedReadyMedia(userId, fileIds, db, ['document', 'image']);

  const assessment = await assessForm(userId, body);
  const [before] = await db
    .select({ memberRole: users.memberRole, headline: users.headline, status: users.verificationStatus, onboarded: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, userId));

  if (assessment.decision === 'rejected') {
    await audit({
      actorId: userId,
      action: 'user.verification_auto_rejected',
      entityType: 'user',
      entityId: userId,
      message: assessment.summary,
      after: { role: body.memberRole, fields: assessment.fieldErrors },
    }, req);
    req.log.info({ userId, role: body.memberRole, fields: assessment.fieldErrors }, 'role form rejected by auto-verification');
    const count = Object.keys(assessment.fieldErrors).length;
    throw Errors.verificationFailed(count === 1 ? Object.values(assessment.fieldErrors)[0]! : `We couldn't verify ${count} of your answers. Fix the highlighted fields and submit again.`, assessment.fieldErrors);
  }

  const now = new Date().toISOString();
  const r = body.memberRole === 'researcher' ? body.details : null;
  const row = { memberRole: body.memberRole, details, mediaIds: fileIds, status: 'verified' as const, submittedAt: now, reviewedAt: now, reviewedById: null, reviewNote: null, decidedBy: 'auto', trustScore: assessment.score, autoChecks: storedChecks(assessment) };
  await db.transaction(async (tx) => {
    await assertOwnedReadyMedia(userId, fileIds, tx, ['document', 'image']);
    await tx.insert(memberVerifications).values({ userId, ...row }).onConflictDoUpdate({ target: memberVerifications.userId, set: row });
    await tx
      .update(users)
      .set({
        memberRole: body.memberRole,
        verificationStatus: 'verified',
        // Researcher fields are mirrored on the user for the admin user panel.
        institutionalEmail: r?.institutionalEmail ?? null,
        researchLink: r?.researchProjectLink ?? null,
        researchEvidence: r?.researchEvidence ?? null,
        ...(body.memberRole === 'professional' && !before?.headline ? { headline: body.details.professionalTitle } : {}),
      })
      .where(eq(users.id, userId));
    await audit(
      {
        actorId: userId,
        action: 'user.verification_auto_approved',
        entityType: 'user',
        entityId: userId,
        message: assessment.summary,
        before: { role: before?.memberRole, status: before?.status },
        after: { role: body.memberRole, status: 'verified', trustScore: assessment.score },
      },
      req,
      tx,
    );
  });

  const role = roleLabel[body.memberRole] ?? body.memberRole;
  await notify([userId], { type: 'verification', targetType: 'user', targetId: userId, title: `Your ${role} profile is verified`, body: 'Your profile now shows the verified badge.', push: false });
  const finished = await completeOnboardingIfReady(userId);
  if (!finished && before?.onboarded && before.memberRole !== body.memberRole) await notifyAdminsOfMember(userId, 'role_changed');
  return assessment;
}

/**
 * Re-runs automatic verification on a stored form (admin "Re-check", and forms that were waiting in the old
 * manual queue). Verified → badge; failing → rejected with the reasons, and the member is told what to fix.
 */
export async function recheckStoredForm(userId: string, actorId: string | null) {
  const [v] = await db.select().from(memberVerifications).where(eq(memberVerifications.userId, userId));
  if (!v) throw Errors.notFound('Verification');
  const parsed = roleBody.safeParse({ memberRole: v.memberRole, details: v.details });
  const now = new Date().toISOString();
  let status: 'verified' | 'rejected';
  let note: string | null;
  let assessment: Assessment | null = null;
  if (!parsed.success) {
    // Legacy roles or forms saved before a field rule changed.
    status = 'rejected';
    note = 'Your role form is incomplete. Choose your role again and fill in the form.';
  } else {
    assessment = await assessForm(userId, parsed.data);
    status = assessment.decision;
    note = status === 'rejected' ? [...new Set(Object.values(assessment.fieldErrors))].join(' ') : null;
  }
  const changed = v.status !== status;
  await db.transaction(async (tx) => {
    await tx
      .update(memberVerifications)
      .set({ status, reviewedAt: now, reviewedById: actorId, reviewNote: note, decidedBy: 'auto', trustScore: assessment?.score ?? 0, autoChecks: assessment ? storedChecks(assessment) : null })
      .where(eq(memberVerifications.userId, userId));
    await tx.update(users).set({ verificationStatus: status }).where(and(eq(users.id, userId), eq(users.memberRole, v.memberRole)));
    await audit({ actorId, action: `user.verification_auto_${status === 'verified' ? 'approved' : 'rejected'}`, entityType: 'user', entityId: userId, message: assessment?.summary ?? note ?? undefined, after: { role: v.memberRole, status } }, undefined, tx);
  });
  if (changed) {
    const role = roleLabel[v.memberRole] ?? v.memberRole;
    const [u] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, userId));
    await notify([userId], { type: 'verification', targetType: 'user', targetId: userId, title: status === 'verified' ? `Your ${role} profile is verified` : `We could not verify your ${role} profile`, body: note ?? '' });
    if (u) await sendMailSafe(u.email, templates.verificationResult({ name: u.fullName.split(' ')[0]!, role, approved: status === 'verified', note, automatic: true }));
  }
  return { status, assessment };
}

/** Clears forms left `pending` by the old manual-review flow, a few at a time (daily cron). */
export async function processPendingVerifications(budgetMs = 15_000) {
  const started = Date.now();
  let processed = 0;
  while (Date.now() - started < budgetMs) {
    const batch = await db.select({ userId: memberVerifications.userId }).from(memberVerifications).where(eq(memberVerifications.status, 'pending')).orderBy(memberVerifications.submittedAt).limit(5);
    if (!batch.length) break;
    for (const { userId } of batch) {
      if (Date.now() - started >= budgetMs) return processed;
      try {
        await recheckStoredForm(userId, null);
      } catch (err) {
        logger.error({ err, userId }, '[verification] backlog recheck failed');
        // Leave a mark so one broken row can't block the queue forever.
        await db.update(memberVerifications).set({ status: 'rejected', reviewNote: 'Please submit your role form again.', decidedBy: 'auto', reviewedAt: new Date().toISOString() }).where(eq(memberVerifications.userId, userId));
      }
      processed++;
    }
  }
  return processed;
}
