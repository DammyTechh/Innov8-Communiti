import { and, count, eq, inArray } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { media, memberVerifications, userInterests, users } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { sendMailSafe, templates } from '../../lib/mailer/index.js';
import { mediaDto, memberRoleEnum, verificationStatusEnum } from '../_shared/dto.js';
import { assertOwnedReadyMedia, toMediaDtos } from '../_shared/media.js';

/**
 * Onboarding after email verification (Figma: Select Role → role form → One more thing!):
 *   1. PUT /me/role       role + the role's verification form (Researcher, Innovator, Professional, Learner)
 *   2. PUT /me/interests  topics ("Go to Communiti")
 * Onboarding completes as soon as both are done. The form goes to admins for review
 * (verificationStatus pending → verified / rejected); members can use the app meanwhile.
 */

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const link = z.url('Enter a valid link, starting with https://').max(500);
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
    reviewedAt: z.string().nullable(),
    reviewNote: z.string().nullable().describe('Why it was rejected, when rejected'),
  })
  .meta({ id: 'Verification' });

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

/** Marks onboarding complete (and sends the welcome email) once a role and at least one topic are set. */
export async function completeOnboardingIfReady(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.onboardingCompletedAt || !u.memberRole) return false;
  const [interests] = await db.select({ n: count() }).from(userInterests).where(eq(userInterests.userId, userId));
  if (!interests?.n) return false;
  await db.update(users).set({ onboardingCompletedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await sendMailSafe(u.email, templates.welcome({ name: u.fullName.split(' ')[0]! }));
  return true;
}

/**
 * Saves the role and its form, and (re)starts verification. Re-submitting (Settings → "Change my role",
 * "Change this email") replaces the previous form and sends it back for review.
 */
export async function submitRole(req: FastifyRequest, userId: string, body: RoleBody) {
  const details = body.details as Record<string, unknown>;
  const fileIds = body.memberRole === 'innovator' ? [...new Set([...body.details.evidenceFileIds, ...body.details.otherCueFileIds])] : [];
  const [before] = await db.select({ memberRole: users.memberRole, headline: users.headline, status: users.verificationStatus }).from(users).where(eq(users.id, userId));
  const now = new Date().toISOString();
  const r = body.memberRole === 'researcher' ? body.details : null;

  await db.transaction(async (tx) => {
    await assertOwnedReadyMedia(userId, fileIds, tx, ['document', 'image']);
    await tx
      .insert(memberVerifications)
      .values({ userId, memberRole: body.memberRole, details, mediaIds: fileIds, status: 'pending', submittedAt: now })
      .onConflictDoUpdate({
        target: memberVerifications.userId,
        set: { memberRole: body.memberRole, details, mediaIds: fileIds, status: 'pending', submittedAt: now, reviewedAt: null, reviewedById: null, reviewNote: null },
      });
    await tx
      .update(users)
      .set({
        memberRole: body.memberRole,
        verificationStatus: 'pending',
        // Researcher fields are mirrored on the user for the admin user panel.
        institutionalEmail: r?.institutionalEmail ?? null,
        researchLink: r?.researchProjectLink ?? null,
        researchEvidence: r?.researchEvidence ?? null,
        ...(body.memberRole === 'professional' && !before?.headline ? { headline: body.details.professionalTitle } : {}),
      })
      .where(eq(users.id, userId));
    await audit(
      { actorId: userId, action: 'user.verification_submitted', entityType: 'user', entityId: userId, before: { role: before?.memberRole, status: before?.status }, after: { role: body.memberRole, status: 'pending' } },
      req,
      tx,
    );
  });
  await completeOnboardingIfReady(userId);
}
