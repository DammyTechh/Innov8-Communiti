import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import {
  contractStatus,
  joinRequestStatus,
  ledgerType,
  projectRole,
  projectStatus,
  researchKind,
  taskStatus,
  visibility,
  workspaceTarget,
} from './enums.js';
import { media } from './content.js';
import { topics, users } from './users.js';

export const projects = pgTable(
  'projects',
  {
    id: pk(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    slug: text().notNull(),
    pitch: text().notNull().default(''),
    problem: text().notNull().default(''),
    solution: text().notNull().default(''),
    coverUrl: text(),
    videoUrl: text(),
    status: projectStatus().notNull().default('open'),
    visibility: visibility().notNull().default('public'),
    memberCount: integer().notNull().default(0),
    featuredAt: ts(),
    removedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('projects_slug_key').on(t.slug), index('projects_owner_idx').on(t.ownerId), index('projects_status_idx').on(t.status)],
);

export const projectTopics = pgTable(
  'project_topics',
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.topicId] }), index('project_topics_topic_idx').on(t.topicId)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRole().notNull().default('contributor'),
    title: text(),
    notificationPrefs: jsonb().$type<Record<string, boolean>>().notNull().default({}),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_members_user_idx').on(t.userId)],
);

export const projectJoinRequests = pgTable(
  'project_join_requests',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text(),
    status: joinRequestStatus().notNull().default('pending'),
    decidedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('project_join_requests_one_pending').on(t.projectId, t.userId).where(sql`${t.status} = 'pending'`),
    index('project_join_requests_project_idx').on(t.projectId, t.status),
  ],
);

export const researchDocs = pgTable(
  'research_docs',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    kind: researchKind().notNull(),
    /** Rich-text JSON for in-app documents (TipTap / ProseMirror compatible). */
    content: jsonb(),
    mediaId: uuid().references(() => media.id, { onDelete: 'set null' }),
    commentCount: integer().notNull().default(0),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('research_docs_project_idx').on(t.projectId, t.id)],
);

export const prototypes = pgTable(
  'prototypes',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text().notNull().default(''),
    coverUrl: text(),
    versionCount: integer().notNull().default(0),
    latestVersionLabel: text(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('prototypes_project_idx').on(t.projectId, t.id)],
);

export const prototypeVersions = pgTable(
  'prototype_versions',
  {
    id: pk(),
    prototypeId: uuid()
      .notNull()
      .references(() => prototypes.id, { onDelete: 'cascade' }),
    uploadedById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    versionLabel: text().notNull(),
    notes: text().notNull().default(''),
    commentCount: integer().notNull().default(0),
    deletedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('prototype_versions_label_key').on(t.prototypeId, t.versionLabel)],
);

export const prototypeVersionMedia = pgTable(
  'prototype_version_media',
  {
    versionId: uuid()
      .notNull()
      .references(() => prototypeVersions.id, { onDelete: 'cascade' }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.mediaId] })],
);

export const workspaceComments = pgTable(
  'workspace_comments',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetType: workspaceTarget().notNull(),
    targetId: uuid().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => workspaceComments.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('workspace_comments_target_idx').on(t.targetType, t.targetId, t.id)],
);

export const evaluations = pgTable(
  'evaluations',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    expertId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    researchDocId: uuid().references(() => researchDocs.id, { onDelete: 'set null' }),
    prototypeVersionId: uuid().references(() => prototypeVersions.id, { onDelete: 'set null' }),
    feasibility: smallint().notNull(),
    sustainability: smallint().notNull(),
    novelty: smallint().notNull(),
    feedback: text().notNull(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [
    index('evaluations_project_idx').on(t.projectId, t.id),
    check('evaluations_scores_range', sql`${t.feasibility} between 1 and 5 and ${t.sustainability} between 1 and 5 and ${t.novelty} between 1 and 5`),
  ],
);

export const contracts = pgTable(
  'contracts',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    uploadedById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    status: contractStatus().notNull().default('draft'),
    signedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('contracts_project_idx').on(t.projectId, t.id)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    dueDate: date({ mode: 'string' }),
    status: taskStatus().notNull().default('todo'),
    completedAt: ts(),
    completedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('tasks_project_idx').on(t.projectId, t.status), index('tasks_assignee_idx').on(t.assigneeId)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: pk(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    type: ledgerType().notNull(),
    refType: text(),
    refId: uuid(),
    summary: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_entries_project_idx').on(t.projectId, t.id)],
);
