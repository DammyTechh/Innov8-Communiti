import { z } from 'zod';
import { mediaDto, userSummary } from '../_shared/dto.js';

export const researchDto = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    title: z.string(),
    kind: z.enum(['written', 'uploaded']),
    content: z.unknown().nullable().describe('Rich-text JSON (TipTap/ProseMirror) for written docs'),
    file: mediaDto.nullable(),
    author: userSummary,
    commentCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ResearchDoc' });

export const versionDto = z
  .object({ id: z.uuid(), versionLabel: z.string(), notes: z.string(), media: z.array(mediaDto), uploadedBy: userSummary, commentCount: z.number(), createdAt: z.string() })
  .meta({ id: 'PrototypeVersion' });

export const prototypeDto = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    name: z.string(),
    description: z.string(),
    coverUrl: z.string().nullable(),
    versionCount: z.number(),
    latestVersionLabel: z.string().nullable(),
    createdBy: userSummary,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Prototype' });

export const workspaceCommentDto = z
  .object({ id: z.uuid(), targetType: z.enum(['research_doc', 'prototype_version']), targetId: z.uuid(), parentId: z.uuid().nullable(), body: z.string(), author: userSummary, createdAt: z.string() })
  .meta({ id: 'WorkspaceComment' });

const score = z.number().int().min(1).max(5);
export const evaluationDto = z
  .object({
    id: z.uuid(),
    expert: userSummary,
    researchDocId: z.uuid().nullable(),
    prototypeVersionId: z.uuid().nullable(),
    feasibility: z.number(),
    sustainability: z.number(),
    novelty: z.number(),
    feedback: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Evaluation' });
export const evaluationBody = z.object({
  feasibility: score,
  sustainability: score,
  novelty: score,
  feedback: z.string().trim().min(10, 'Write at least a sentence of feedback').max(5000),
  researchDocId: z.uuid().optional(),
  prototypeVersionId: z.uuid().optional(),
});

export const contractDto = z
  .object({ id: z.uuid(), title: z.string(), description: z.string(), status: z.enum(['draft', 'sent', 'signed', 'void']), file: mediaDto.nullable(), uploadedBy: userSummary, signedAt: z.string().nullable(), createdAt: z.string() })
  .meta({ id: 'Contract' });

export const taskDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['todo', 'done']),
    dueDate: z.string().nullable(),
    assignee: userSummary.nullable(),
    createdBy: userSummary,
    completedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Task' });

export const ledgerDto = z
  .object({ id: z.uuid(), type: z.string(), summary: z.string(), actor: userSummary.nullable(), refType: z.string().nullable(), refId: z.string().nullable(), data: z.record(z.string(), z.unknown()), createdAt: z.string() })
  .meta({ id: 'LedgerEntry' });
