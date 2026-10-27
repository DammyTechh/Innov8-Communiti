/**
 * Verifies the Resend SMTP credentials and sends one sample of every template.
 *   MAIL_TEST_TO=you@example.com npm run mail:test
 */
import { sendMail, templates, verifyMailer } from '../src/lib/mailer/index.js';

const to = process.env.MAIL_TEST_TO;
if (!to) throw new Error('Set MAIL_TEST_TO (with onboarding@resend.dev this must be your Resend account email)');
await verifyMailer();
console.log('Resend SMTP connection OK');

const id = '00000000-0000-0000-0000-000000000000';
const samples = [
  templates.verifyEmail({ name: 'Ada', code: '482913', minutes: 10 }),
  templates.passwordReset({ name: 'Ada', code: '905122', minutes: 10, email: to }),
  templates.passwordChanged({ name: 'Ada', when: new Date().toUTCString() }),
  templates.welcome({ name: 'Ada' }),
  templates.newSignIn({ name: 'Ada', device: 'ios · Expo', ip: '102.89.0.1', when: new Date().toUTCString() }),
  templates.accountStatus({ name: 'Ada', status: 'suspended', reason: 'Spam', until: new Date(Date.now() + 7 * 864e5).toUTCString() }),
  templates.warning({ name: 'Ada', note: 'Please keep discussions respectful.' }),
  templates.accountDeletionScheduled({ name: 'Ada', date: new Date(Date.now() + 30 * 864e5).toDateString() }),
  templates.projectJoinRequest({ name: 'Ada', requester: 'Tunde Bello', project: 'Solar Irrigation Kit', message: 'I build IoT sensors.', projectId: id }),
  templates.projectJoinDecision({ name: 'Ada', project: 'Solar Irrigation Kit', accepted: true, projectId: id }),
  templates.taskAssigned({ name: 'Ada', task: 'Draft field-test plan', project: 'Solar Irrigation Kit', due: '2026-10-01', projectId: id }),
  templates.expertEvaluation({ name: 'Ada', expert: 'Dr. Chioma Eze', project: 'Solar Irrigation Kit', projectId: id }),
  templates.eventReminder({ name: 'Ada', event: 'Lagos Innovation Meetup', when: 'Friday 2 October 2026, 17:00', where: 'Yaba, Lagos', eventId: id }),
  templates.broadcast({ name: 'Ada', title: 'Applications for Cohort 3 are open', body: 'Submit your project by 30 October.' }),
  templates.maintenance({ name: 'Ada', message: 'We are upgrading our database.', from: 'Saturday 31 October 2026, 22:00 (WAT)', to: 'Sunday 1 November 2026, 02:00 (WAT)', disableAccess: true }),
  templates.emailChangeCode({ name: 'Ada', code: '310577', minutes: 10 }),
  templates.verificationResult({ name: 'Ada', role: 'Researcher', approved: true }),
  templates.verificationResult({ name: 'Ada', role: 'Learner', approved: false, note: 'Please use your school email address.' }),
  templates.collaborationRequest({ name: 'Ada', sender: 'Anita Somoga', message: 'I would like to collab with you on a project.', project: 'Mechanical robot project' }),
  templates.emailChanged({ name: 'Ada', newEmail: 'ada.new@example.com', when: new Date().toUTCString() }),
];
for (const t of samples) {
  await sendMail(to, t);
  console.log(`sent: ${t.tag}`);
  await new Promise((r) => setTimeout(r, 600)); // stay under Resend's default 2 requests/second
}
process.exit(0);
