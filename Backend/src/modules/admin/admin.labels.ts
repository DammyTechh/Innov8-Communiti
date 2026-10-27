/**
 * Human-readable text for audit-log actions, shown in the dashboard's Logs page
 * ("Action" + "Log Message") and in a user's Account logs ("Action" + "Details").
 * Unknown actions fall back to a tidied version of the action key.
 */

const labels: Record<string, string> = {
  'auth.login': 'Logged in',
  'auth.admin_login': 'Logged in to admin dashboard',
  'auth.google_login': 'Logged in with Google',
  'auth.google_signup': 'Signed up with Google',
  'auth.google_linked': 'Google account linked',
  'auth.login_failed': 'Failed login attempt',
  'auth.logout': 'Logged out',
  'auth.logout_all': 'Logged out of all devices',
  'auth.email_verified': 'New user account created',
  'auth.password_reset': 'Password reset',
  'auth.password_changed': 'Password changed',
  'auth.password_set': 'Password set',
  'user.email_changed': 'Changed email',
  'user.verification_submitted': 'Verification details submitted',
  'user.verification_approved': 'Verification approved',
  'user.verification_rejected': 'Verification rejected',
  'user.blocked_member': 'Blocked a member',
  'user.profile_updated': 'Profile updated',
  'user.deletion_scheduled': 'Account deletion requested',
  'user.role_changed': 'User permissions updated',
  'user.warn': 'User warned',
  'user.restrict': 'User restricted',
  'user.suspend': 'User suspended',
  'user.block': 'User blocked',
  'user.reinstate': 'User reinstated',
  'forum.warn': 'Forum warned',
  'forum.restrict': 'Forum restricted',
  'forum.suspend': 'Forum suspended',
  'forum.reinstate': 'Forum reinstated',
  'forum.removed': 'Forum deleted',
  'forum.restored': 'Forum restored',
  'project.warn': 'Project warned',
  'project.restrict': 'Project restricted',
  'project.suspend': 'Project suspended',
  'project.reinstate': 'Project reinstated',
  'project.removed': 'Project deleted',
  'project.restored': 'Project restored',
  'post.removed': 'Post removed',
  'post.restored': 'Post restored',
  'comment.removed': 'Comment removed',
  'comment.restored': 'Comment restored',
  'report.resolved': 'Report resolved',
  'event.created': 'Event created',
  'event.updated': 'Event updated',
  'event.deleted': 'Event deleted',
  'highlight.created': 'Highlight created',
  'highlight.updated': 'Highlight updated',
  'highlight.deleted': 'Highlight deleted',
  'featured.created': 'Featured innovation created',
  'featured.updated': 'Featured innovation updated',
  'featured.deleted': 'Featured innovation deleted',
  'broadcast.sent': 'Email notification sent',
  'settings.updated': 'System configuration saved',
  'maintenance.scheduled': 'Maintenance scheduled',
  'maintenance.updated': 'Maintenance updated',
  'maintenance.cancelled': 'Maintenance cancelled',
};

export function actionLabel(action: string) {
  const known = labels[action];
  if (known) return known;
  const tidy = action.replace(/[._]/g, ' ').trim();
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

type LogRow = { action: string; message: string | null; before: unknown; after: unknown };

/** The "Log Message" / "Details" column: the stored note when there is one, otherwise a sentence built from before/after. */
export function actionDetails(row: LogRow) {
  const after = (row.after ?? {}) as Record<string, string | number | undefined>;
  const before = (row.before ?? {}) as Record<string, string | number | undefined>;
  switch (row.action) {
    case 'user.email_changed':
      return `changed email to ${after.email ?? ''}`.trim();
    case 'user.role_changed':
      return `Role changed from ${before.role ?? '?'} to ${after.role ?? '?'}`;
    case 'auth.login':
    case 'auth.google_login':
    case 'auth.admin_login':
      return 'user log in';
    case 'auth.logout':
    case 'auth.logout_all':
      return 'user logged out';
    case 'broadcast.sent':
      return row.message ?? `Sent to ${after.recipients ?? 0} recipients`;
    default:
      return row.message ?? actionLabel(row.action);
  }
}

/** Actions that belong in a member's Account logs (their own sign-ins and account changes, plus moderation on them). */
export const accountLogPrefixes = ['auth.', 'user.'];
