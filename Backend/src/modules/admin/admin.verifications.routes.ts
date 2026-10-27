import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
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
import { loadVerification, verificationDetailsDto, verificationDto } from '../me/verification.js';
import { notify } from '../notifications/notifications.service.js';

/** Review queue for the role forms members submit during onboarding (and when they change role or institutional email). */

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
  })
  .meta({ id: 'AdminVerification' });

const roleLabel: Record<string, string> = { researcher: 'Researcher', innovator: 'Innovator', professional: 'Professional', learner: 'Learner' };

export const adminVerificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/verifications', {
    schema: {
      tags,
      summary: 'Role verification queue',
      description: 'Forms submitted from onboarding or Settings. `status` defaults to pending; `q` matches name or email.',
      security: auth,
      querystring: pageQuery.extend({
        status: z.enum(['pending', 'verified', 'rejected', 'all']).default('pending'),
        memberRole: memberRoleEnum.optional(),
        q: z.string().trim().max(100).optional(),
      }),
      response: { 200: offsetPageSchema(rowDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        q.status === 'all' ? undefined : eq(memberVerifications.status, q.status),
        q.memberRole ? eq(memberVerifications.memberRole, q.memberRole) : undefined,
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
        data: rows.map((r) => ({ user: r.user, memberRole: r.v.memberRole, status: r.v.status, details: r.v.details, submittedAt: r.v.submittedAt, reviewedAt: r.v.reviewedAt, reviewNote: r.v.reviewNote })),
        page: q.page,
        pageSize: q.pageSize,
        total: total?.n ?? 0,
      };
    },
  });

  app.get('/verifications/:userId', {
    schema: { tags, summary: "A member's verification form with uploaded evidence", security: auth, params: userParam, response: { 200: verificationDto.extend({ user: userSummary.extend({ email: z.string() }) }) } },
    handler: async (req) => {
      const v = await loadVerification(req.params.userId);
      if (!v) throw Errors.notFound('Verification');
      const [u] = await db.select({ ...userSummaryCols, email: users.email }).from(users).where(eq(users.id, req.params.userId));
      return { ...v, user: u! };
    },
  });

  for (const decision of ['approve', 'reject'] as const) {
    app.post(`/verifications/:userId/${decision}`, {
      schema: {
        tags,
        summary: decision === 'approve' ? 'Approve a role verification (member gets the verified badge)' : 'Reject a role verification',
        description: 'The member is emailed and notified in-app. Rejected members can fix their details and submit again (PUT /me/role).',
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
        if (v.status !== 'pending') throw Errors.conflict(`This verification was already ${v.status}`);
        await db.transaction(async (tx) => {
          await tx.update(memberVerifications).set({ status, reviewedAt: new Date().toISOString(), reviewedById: me.id, reviewNote: note }).where(eq(memberVerifications.userId, v.userId));
          await tx.update(users).set({ verificationStatus: status }).where(and(eq(users.id, v.userId), eq(users.memberRole, v.memberRole)));
          await audit({ actorId: me.id, action: `user.verification_${decision === 'approve' ? 'approved' : 'rejected'}`, entityType: 'user', entityId: v.userId, message: note ?? undefined, after: { role: v.memberRole, status } }, req, tx);
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
