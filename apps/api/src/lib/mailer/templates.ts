import { env } from '../../config/env.js';
import type { LayoutInput } from './layout.js';

export interface Template {
  subject: string;
  content: LayoutInput;
  /** Stable id per template; sent as a header so Resend doesn't thread unrelated emails. */
  tag?: string;
}

export const templates = {
  verifyEmail: (p: { name: string; code: string; minutes: number }): Template => ({
    tag: 'verifyEmail',
    subject: `${p.code} is your ${env.APP_NAME} verification code`,
    content: {
      preheader: `Your verification code is ${p.code}`,
      heading: 'Verify your email',
      paragraphs: [`Hi ${p.name}, enter this code to finish creating your account.`],
      code: p.code,
      footnote: `The code expires in ${p.minutes} minutes. If you did not sign up, you can ignore this email.`,
    },
  }),

  passwordReset: (p: { name: string; code: string; minutes: number; email: string }): Template => ({
    tag: 'passwordReset',
    subject: `Reset your ${env.APP_NAME} password`,
    content: {
      preheader: `Your password reset code is ${p.code}`,
      heading: 'Reset your password',
      paragraphs: [`Hi ${p.name}, we received a request to reset your password. Enter this code in the app, or use the button below.`],
      code: p.code,
      button: {
        label: 'Reset password',
        url: `${env.WEB_URL}/reset-password?email=${encodeURIComponent(p.email)}&code=${p.code}`,
      },
      footnote: `The code expires in ${p.minutes} minutes. If you did not ask for this, your password is unchanged and you can ignore this email.`,
    },
  }),

  passwordChanged: (p: { name: string; when: string }): Template => ({
    tag: 'passwordChanged',
    subject: `Your ${env.APP_NAME} password was changed`,
    content: {
      preheader: 'Your password was just changed',
      heading: 'Password changed',
      paragraphs: [
        `Hi ${p.name}, the password for your account was changed on ${p.when}. You have been signed out on all other devices.`,
        'If this was not you, reset your password immediately and contact support.',
      ],
      button: { label: 'Reset password', url: `${env.WEB_URL}/forgot-password` },
    },
  }),

  welcome: (p: { name: string }): Template => ({
    tag: 'welcome',
    subject: `Welcome to ${env.APP_NAME}`,
    content: {
      preheader: 'Your account is ready',
      heading: `Welcome, ${p.name}`,
      paragraphs: [
        'Your account is ready. Follow people and forums in your field, join a project, or start your own and invite collaborators.',
      ],
      button: { label: `Open ${env.APP_NAME}`, url: env.WEB_URL },
    },
  }),

  accountStatus: (p: { name: string; status: string; reason?: string | null; until?: string | null }): Template => ({
    tag: 'accountStatus',
    subject: `Update on your ${env.APP_NAME} account`,
    content: {
      preheader: `Your account status changed to ${p.status}`,
      heading: 'Your account status changed',
      paragraphs: [
        `Hi ${p.name}, your account is now ${p.status}${p.until ? ` until ${p.until}` : ''}.`,
        ...(p.reason ? [`Reason: ${p.reason}`] : []),
        'If you believe this is a mistake, reply to this email to appeal.',
      ],
    },
  }),

  warning: (p: { name: string; note: string }): Template => ({
    tag: 'warning',
    subject: `A note from the ${env.APP_NAME} moderation team`,
    content: {
      preheader: 'Please review our community guidelines',
      heading: 'Community guidelines warning',
      paragraphs: [`Hi ${p.name}, some of your content was reported and reviewed by our team.`, p.note, 'Repeated violations can lead to suspension.'],
    },
  }),

  accountDeletionScheduled: (p: { name: string; date: string }): Template => ({
    tag: 'accountDeletionScheduled',
    subject: `Your ${env.APP_NAME} account will be deleted`,
    content: {
      preheader: `Deletion scheduled for ${p.date}`,
      heading: 'Account deletion scheduled',
      paragraphs: [
        `Hi ${p.name}, your account and content will be permanently deleted on ${p.date}.`,
        'Changed your mind? Sign in before that date to cancel the deletion.',
      ],
    },
  }),

  newSignIn: (p: { name: string; device: string; ip: string | null; when: string }): Template => ({
    tag: 'newSignIn',
    subject: `New sign-in to your ${env.APP_NAME} account`,
    content: {
      preheader: `Signed in on ${p.device}`,
      heading: 'New sign-in detected',
      paragraphs: [
        `Hi ${p.name}, your account was just signed in on a new device.`,
        `Device: ${p.device}`,
        `When: ${p.when}${p.ip ? ` · IP ${p.ip}` : ''}`,
        'If this was you, no action is needed. If not, reset your password now. That signs you out everywhere.',
      ],
      button: { label: 'Reset password', url: `${env.WEB_URL}/forgot-password` },
    },
  }),

  projectJoinRequest: (p: { name: string; requester: string; project: string; message?: string | null; projectId: string }): Template => ({
    tag: 'projectJoinRequest',
    subject: `${p.requester} wants to join ${p.project}`,
    content: {
      preheader: `New join request for ${p.project}`,
      heading: 'New join request',
      paragraphs: [`Hi ${p.name}, ${p.requester} asked to join ${p.project}.`, ...(p.message ? [`Their message: "${p.message}"`] : [])],
      button: { label: 'Review request', url: `${env.WEB_URL}/projects/${p.projectId}/workspace/requests` },
    },
  }),

  projectJoinDecision: (p: { name: string; project: string; accepted: boolean; projectId: string }): Template => ({
    tag: 'projectJoinDecision',
    subject: p.accepted ? `You're in: ${p.project}` : `Update on your request to join ${p.project}`,
    content: {
      preheader: p.accepted ? 'Your join request was accepted' : 'Your join request was declined',
      heading: p.accepted ? 'Request accepted' : 'Request declined',
      paragraphs: [
        p.accepted
          ? `Hi ${p.name}, you are now a member of ${p.project}. The workspace and project chat are open to you.`
          : `Hi ${p.name}, the team behind ${p.project} declined your request this time. There are plenty of other projects looking for collaborators.`,
      ],
      button: p.accepted ? { label: 'Open workspace', url: `${env.WEB_URL}/projects/${p.projectId}/workspace` } : { label: 'Browse projects', url: `${env.WEB_URL}/projects` },
    },
  }),

  taskAssigned: (p: { name: string; task: string; project: string; due?: string | null; projectId: string }): Template => ({
    tag: 'taskAssigned',
    subject: `New task in ${p.project}: ${p.task}`,
    content: {
      preheader: `You were assigned "${p.task}"`,
      heading: 'You have a new task',
      paragraphs: [`Hi ${p.name}, you were assigned "${p.task}" in ${p.project}.`, ...(p.due ? [`Due: ${p.due}`] : [])],
      button: { label: 'View task', url: `${env.WEB_URL}/projects/${p.projectId}/workspace/tasks` },
    },
  }),

  expertEvaluation: (p: { name: string; expert: string; project: string; projectId: string }): Template => ({
    tag: 'expertEvaluation',
    subject: `${p.expert} reviewed ${p.project}`,
    content: {
      preheader: 'A new expert evaluation is ready',
      heading: 'New expert evaluation',
      paragraphs: [`Hi ${p.name}, ${p.expert} scored ${p.project} on feasibility, sustainability and novelty, and left feedback.`],
      button: { label: 'Read the review', url: `${env.WEB_URL}/projects/${p.projectId}/workspace/expert` },
    },
  }),

  eventReminder: (p: { name: string; event: string; when: string; where: string; eventId: string }): Template => ({
    tag: 'eventReminder',
    subject: `Reminder: ${p.event} is coming up`,
    content: {
      preheader: `${p.event} starts ${p.when}`,
      heading: p.event,
      paragraphs: [`Hi ${p.name}, a reminder that you're going to ${p.event}.`, `When: ${p.when}`, `Where: ${p.where}`],
      button: { label: 'View event', url: `${env.WEB_URL}/explore/events/${p.eventId}` },
    },
  }),

  broadcast: (p: { name: string; title: string; body: string }): Template => ({
    tag: 'broadcast',
    subject: p.title,
    content: { preheader: p.body.slice(0, 90), heading: p.title, paragraphs: [`Hi ${p.name},`, p.body], button: { label: `Open ${env.APP_NAME}`, url: env.WEB_URL } },
  }),
};
