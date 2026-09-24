import { pgEnum } from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['innovator', 'researcher', 'expert', 'investor', 'student']);
export const platformRole = pgEnum('platform_role', ['member', 'moderator', 'admin', 'super_admin']);
export const userStatus = pgEnum('user_status', ['active', 'flagged', 'restricted', 'suspended', 'blocked']);
export const themePref = pgEnum('theme_pref', ['light', 'dark', 'system']);
export const profileVisibility = pgEnum('profile_visibility', ['public', 'members', 'private']);
export const messagePermission = pgEnum('message_permission', ['everyone', 'following', 'none']);
export const clientKind = pgEnum('client_kind', ['web', 'admin', 'ios', 'android', 'unknown']);
export const otpPurpose = pgEnum('otp_purpose', ['verify_email', 'password_reset']);

export const mediaKind = pgEnum('media_kind', ['image', 'video', 'document', 'audio']);
export const mediaVisibility = pgEnum('media_visibility', ['public', 'private']);
export const mediaStatus = pgEnum('media_status', ['pending', 'ready', 'failed']);

export const postAudience = pgEnum('post_audience', ['everyone', 'followers', 'forum', 'project']);
export const visibility = pgEnum('visibility', ['public', 'private']);
export const forumRole = pgEnum('forum_role', ['owner', 'moderator', 'member']);

export const projectStatus = pgEnum('project_status', ['open', 'ongoing', 'completed', 'archived']);
export const projectRole = pgEnum('project_role', ['owner', 'admin', 'contributor', 'viewer']);
export const joinRequestStatus = pgEnum('join_request_status', ['pending', 'accepted', 'declined', 'cancelled']);
export const researchKind = pgEnum('research_kind', ['written', 'uploaded']);
export const workspaceTarget = pgEnum('workspace_target', ['research_doc', 'prototype_version']);
export const contractStatus = pgEnum('contract_status', ['draft', 'sent', 'signed', 'void']);
export const taskStatus = pgEnum('task_status', ['todo', 'done']);
export const ledgerType = pgEnum('ledger_type', [
  'project_created',
  'project_updated',
  'chat_update',
  'research_doc',
  'expert_review',
  'prototype_created',
  'prototype_updated',
  'member_joined',
  'member_left',
  'task_created',
  'task_completed',
  'contract_added',
]);

export const conversationKind = pgEnum('conversation_kind', ['direct', 'project']);
export const messageKind = pgEnum('message_kind', ['text', 'image', 'file', 'voice', 'system']);

export const eventCategory = pgEnum('event_category', ['hackathon', 'workshop', 'meetup', 'conference', 'webinar', 'other']);
export const eventStatus = pgEnum('event_status', ['draft', 'published', 'cancelled']);
export const rsvpStatus = pgEnum('rsvp_status', ['going', 'interested']);
export const pushPlatform = pgEnum('push_platform', ['ios', 'android', 'web']);

export const reportTarget = pgEnum('report_target', ['post', 'comment', 'forum', 'project', 'user', 'message']);
export const reportReason = pgEnum('report_reason', [
  'spam',
  'scam',
  'harassment',
  'insults',
  'hate',
  'misinformation',
  'nudity',
  'violence',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['pending', 'reviewed', 'dismissed']);
export const moderationActionType = pgEnum('moderation_action', [
  'dismiss',
  'remove_content',
  'restore_content',
  'warn',
  'restrict',
  'suspend',
  'block',
  'reinstate',
]);
