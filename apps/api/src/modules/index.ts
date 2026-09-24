import type { FastifyPluginAsync } from 'fastify';
import { adminRoutes } from './admin/admin.routes.js';
import { authRoutes } from './auth/auth.routes.js';
import { chatRoutes } from './chat/chat.routes.js';
import { exploreRoutes } from './explore/explore.routes.js';
import { forumRoutes } from './forums/forums.routes.js';
import { healthRoutes } from './health/health.routes.js';
import { cronRoutes } from './internal/cron.routes.js';
import { meRoutes, topicRoutes } from './me/me.routes.js';
import { notificationRoutes } from './notifications/notifications.routes.js';
import { postRoutes } from './posts/posts.routes.js';
import { projectRoutes } from './projects/projects.routes.js';
import { reportRoutes } from './reports/reports.routes.js';
import { searchRoutes } from './search/search.routes.js';
import { uploadRoutes } from './uploads/uploads.routes.js';
import { userRoutes } from './users/users.routes.js';
import { workspaceRoutes } from './workspace/workspace.routes.js';

/** Every module is mounted under /api/v1. */
export const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(topicRoutes);
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(uploadRoutes, { prefix: '/uploads' });
  await app.register(postRoutes); // /feed, /posts, /comments, /users/:id/posts
  await app.register(searchRoutes); // /search, /trending
  await app.register(forumRoutes, { prefix: '/forums' });
  await app.register(projectRoutes); // /projects, /users/:id/projects
  await app.register(workspaceRoutes); // /projects/:id/{research,prototypes,tasks,...}
  await app.register(chatRoutes); // /conversations, /messages
  await app.register(exploreRoutes); // /events, /featured, /highlights
  await app.register(notificationRoutes); // /notifications, /push-tokens
  await app.register(reportRoutes); // /reports
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(cronRoutes, { prefix: '/internal' });
};
