import { and, count, desc, eq, ilike, lte, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { memberVerifications, users } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { contains } from '../../lib/like.js';
import { sendMailSafe, templates } from '../../lib/mailer/index.js';
import { offsetPageSchema, pageQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, memberRoleEnum, userSummary, verificationStatusEnum } from '../_shared/dto.js';
import { userSummaryCols } from '../_shared/users.js';
import { autoChecksDto, loadVerification, recheckStoredForm, roleLabel, verificationDetailsDto, verificationDto } from '../me/verification.js';
import { notify } from '../notifications/notifications.service.js';

/**
 * Role verifications. Forms are verified automatically when members submit them (modules/verification);
 * this is where admins see every decision with its checks and trust score, and override one when needed.
 */

const tags = ['Admin'];
const userParam = z.object({ userId: z.uuid() });

const rowDto = z
  .object({
    user: userSummary.extend({ email: z.string() }),
    memberRole: memberRoleEnum,
    status: verificationStatusEnum,
    details: verificationDetailsDto,
    submittedAt: z.string(),
    reviewedAt: z.string().nullable(),
    reviewNote: z.string().nullable(),
    decidedBy: z.enum(['auto', 'admin']).nullable(),
    trustScore: z.number().nullable().describe('0–100 evidence score from automatic verification; low scores are worth a look'),
    flags: z.array(z.string()).describe('Checks that raised a warning, e.g. email_matches_org, link_mentions, independent_evidence'),
  })
  .meta({ id: 'AdminVerification' });

type StoredChecks = { checks?: { outcome: string; check: string }[] } | null;
const flagsOf = (a: unknown) => [...new Set(((a as StoredChecks)?.checks ?? []).filter((c) => c.outcome === 'warn').map((c) => c.check))];
const decidedByOf = (d: string | null): 'auto' | 'admin' | null => (d === 'auto' || d === 'admin' ? d : null);

export const adminVerificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/verifications', {
    schema: {
      tags,
      summary: 'Role verifications (automatic decisions and overrides)',
      description:
        'Forms submitted from onboarding or Settings, newest first. Forms are verified automatically on submit, so `status` defaults to `all`; `pending` only holds forms from before automatic verification (the daily job clears them). `decidedBy` filters automatic vs admin decisions, `maxTrust` lists low-evidence verifications worth a look, `q` matches name or email.',
      security: auth,
      querystring: pageQuery.extend({
        status: z.enum(['pending', 'verified', 'rejected', 'all']).default('all'),
        memberRole: memberRoleEnum.optional(),
        decidedBy: z.enum(['auto', 'admin']).optional(),
        maxTrust: z.coerce.number().int().min(0).max(100).optional().describe('Only verifications with trustScore at or below this'),
        q: z.string().trim().max(100).optional(),
      }),
      response: { 200: offsetPageSchema(rowDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        q.status === 'all' ? undefined : eq(memberVerifications.status, q.status),
        q.memberRole ? eq(memberVerifications.memberRole, q.memberRole) : undefined,
        q.decidedBy ? eq(memberVerifications.decidedBy, q.decidedBy) : undefined,
        q.maxTrust !== undefined ? lte(memberVerifications.trustScore, q.maxTrust) : undefined,
        q.q ? or(ilike(users.fullName, contains(q.q)), ilike(users.email, contains(q.q))) : undefined,
      );
      const [[total], rows] = await Promise.all([
        db.select({ n: count() }).from(memberVerifications).innerJoin(users, eq(users.id, memberVerifications.userId)).where(where),
        db
          .select({ v: memberVerifications, user: { ...userSummaryCols, email: users.email } })
          .from(memberVerifications)
          .innerJoin(users, eq(users.id, memberVerifications.userId))
          .where(where)
          .orderBy(q.status === 'pending' ? sql`${memberVerifications.submittedAt} asc` : desc(memberVerifications.submittedAt))
          .limit(q.pageSize)
          .offset((q.page - 1) * q.pageSize),
      ]);
      return {
        data: rows.map((r) => ({
          user: r.user,
          memberRole: r.v.memberRole,
          status: r.v.status,
          details: r.v.details,
          submittedAt: r.v.submittedAt,
          reviewedAt: r.v.reviewedAt,
          reviewNote: r.v.reviewNote,
          decidedBy: decidedByOf(r.v.decidedBy),
          trustScore: r.v.trustScore,
          flags: flagsOf(r.v.autoChecks),
        })),
        page: q.page,
        pageSize: q.pageSize,
        total: total?.n ?? 0,
      };
    },
  });

  app.get('/verifications/:userId', {
    schema: {
      tags,
      summary: "A member's verification form, evidence and automatic checks",
      security: auth,
      params: userParam,
      response: { 200: verificationDto.extend({ user: userSummary.extend({ email: z.string() }), trustScore: z.number().nullable(), autoChecks: autoChecksDto.nullable() }) },
    },
    handler: async (req) => {
      const v = await loadVerification(req.params.userId);
      if (!v) throw Errors.notFound('Verification');
      const [[u], [raw]] = await Promise.all([
        db.select({ ...userSummaryCols, email: users.email }).from(users).where(eq(users.id, req.params.userId)),
        db.select({ trustScore: memberVerifications.trustScore, autoChecks: memberVerifications.autoChecks }).from(memberVerifications).where(eq(memberVerifications.userId, req.params.userId)),
      ]);
      const checks = autoChecksDto.safeParse(raw?.autoChecks);
      return { ...v, user: u!, trustScore: raw?.trustScore ?? null, autoChecks: checks.success ? checks.data : null };
    },
  });

  app.post('/verifications/:userId/recheck', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Re-run automatic verification on a stored form',
      description: 'Useful after a lookup was inconclusive (a site or ORCID was down) or for forms from before automatic verification. The member is notified only when the status changes.',
      security: auth,
      params: userParam,
      response: { 200: verificationDto.extend({ trustScore: z.number().nullable(), autoChecks: autoChecksDto.nullable() }) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { assessment } = await recheckStoredForm(req.params.userId, me.id);
      const v = (await loadVerification(req.params.userId))!;
      return { ...v, trustScore: assessment?.score ?? 0, autoChecks: assessment ? autoChecksDto.parse(assessment) : null };
    },
  });

  for (const decision of ['approve', 'reject'] as const) {
    app.post(`/verifications/:userId/${decision}`, {
      schema: {
        tags,
        summary: decision === 'approve' ? 'Approve a role verification (override: member gets the verified badge)' : 'Reject or revoke a role verification (override)',
        description:
          'Overrides the automatic decision: approve a rejected form, or reject (revoke) a verified one. Returns 409 when the form already has that status. The member is emailed and notified in-app. Rejected members can fix their details and submit again (PUT /me/role).',
        security: auth,
        params: userParam,
        body: decision === 'approve' ? z.object({ note: z.string().trim().max(1000).optional() }).nullish() : z.object({ note: z.string().trim().min(3, 'Tell the member why').max(1000) }),
        response: { 200: verificationDto },
      },
      handler: async (req) => {
        const me = currentUser(req);
        const status = decision === 'approve' ? ('verified' as const) : ('rejected' as const);
        const note = req.body?.note ?? null;
        const [v] = await db.select().from(memberVerifications).where(eq(memberVerifications.userId, req.params.userId));
        if (!v) throw Errors.notFound('Verification');
        if (v.status === status) throw Errors.conflict(`This verification is already ${v.status}`);
        await db.transaction(async (tx) => {
          await tx.update(memberVerifications).set({ status, reviewedAt: new Date().toISOString(), reviewedById: me.id, reviewNote: note, decidedBy: 'admin' }).where(eq(memberVerifications.userId, v.userId));
          await tx.update(users).set({ verificationStatus: status }).where(and(eq(users.id, v.userId), eq(users.memberRole, v.memberRole)));
          await audit({ actorId: me.id, action: `user.verification_${decision === 'approve' ? 'approved' : 'rejected'}`, entityType: 'user', entityId: v.userId, message: note ?? undefined, before: { status: v.status, decidedBy: v.decidedBy }, after: { role: v.memberRole, status } }, req, tx);
        });
        const [u] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, v.userId));
        const role = roleLabel[v.memberRole] ?? v.memberRole;
        await notify([v.userId], {
          type: 'verification',
          targetType: 'user',
          targetId: v.userId,
          title: decision === 'approve' ? `Your ${role} profile is verified` : `We could not verify your ${role} profile`,
          body: note ?? '',
        });
        if (u) await sendMailSafe(u.email, templates.verificationResult({ name: u.fullName.split(' ')[0]!, role, approved: decision === 'approve', note }));
        return (await loadVerification(v.userId))!;
      },
    });
  }
};
