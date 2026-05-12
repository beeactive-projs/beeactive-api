/**
 * Sends one preview email per template to a single recipient, using
 * the live Resend transport. Used to eyeball the new layout system
 * end-to-end after the phase-2 migration.
 *
 * Run:
 *   npx tsx scripts/send-email-previews.ts
 *
 * The recipient + branding read from .env (RESEND_API_KEY,
 * EMAIL_FROM, EMAIL_FROM_NAME). Each email is prefixed with
 * "[MotionHive Test]" in the subject so the inbox is easy to filter.
 *
 * Order is deliberate: the templates a brand-new user sees first
 * (waitlist, feedback, email-verification, welcome, password-reset)
 * are sent FIRST so they land at the top of the inbox.
 */

import 'dotenv/config';
import { Resend } from 'resend';

import {
  clientInvitationExistingUserTemplate,
  clientInvitationNewUserTemplate,
  clientRequestAcceptedTemplate,
  clientRequestDeclinedTemplate,
  clientRequestToInstructorTemplate,
  collaborationEndedTemplate,
  emailVerificationTemplate,
  feedbackConfirmationTemplate,
  genericNotificationTemplate,
  invitationAcceptedTemplate,
  invitationTemplate,
  invoiceSendTemplate,
  participantStatusTemplate,
  passwordResetTemplate,
  sessionCancelledTemplate,
  sessionReminderTemplate,
  subscriptionSetupTemplate,
  waitlistConfirmationTemplate,
  welcomeTemplate,
} from '../src/common/email';

const RECIPIENT = 'user@motionhive.fit';
const PREVIEW_LINK = 'https://app.motionhive.fit/preview';
const FRONTEND_URL = 'https://app.motionhive.fit';

interface Preview {
  name: string;
  subject: string;
  html: string;
}

const previews: Preview[] = [
  // ─── First-impression tier (waitlist, feedback, auth) ──────────────
  {
    name: 'waitlist/confirmation',
    subject: "[MotionHive Test] You're on the MotionHive waitlist",
    html: waitlistConfirmationTemplate('Alex'),
  },
  {
    name: 'feedback/confirmation',
    subject: '[MotionHive Test] Thanks for your feedback',
    html: feedbackConfirmationTemplate(
      'bug report',
      "Group page won't load on iOS 17",
      'Alex',
    ),
  },
  {
    name: 'auth/email-verification',
    subject: '[MotionHive Test] Verify your MotionHive email',
    html: emailVerificationTemplate(`${PREVIEW_LINK}?token=verify-token`),
  },
  {
    name: 'auth/welcome',
    subject: '[MotionHive Test] Welcome to MotionHive',
    html: welcomeTemplate('Alex', FRONTEND_URL),
  },
  {
    name: 'auth/password-reset',
    subject: '[MotionHive Test] Reset your MotionHive password',
    html: passwordResetTemplate(`${PREVIEW_LINK}?token=reset-token`),
  },

  // ─── Group invitations ─────────────────────────────────────────────
  {
    name: 'group/invitation',
    subject: '[MotionHive Test] Group invitation',
    html: invitationTemplate(
      'Maria Chen',
      'Sunrise Pilates',
      `${PREVIEW_LINK}/accept-invitation?token=inv-token`,
      "I think you'd love this group — we train Tue/Thu mornings.",
    ),
  },
  {
    name: 'group/invitation-accepted',
    subject: '[MotionHive Test] Group invitation accepted',
    html: invitationAcceptedTemplate(
      'Maria Chen',
      'Alex Rivera',
      'Sunrise Pilates',
      FRONTEND_URL,
    ),
  },

  // ─── Client lifecycle (6) ──────────────────────────────────────────
  {
    name: 'client/invitation-new-user',
    subject: '[MotionHive Test] You have a client invitation (new user)',
    html: clientInvitationNewUserTemplate({
      instructorName: 'Coach Daniel',
      signUpLink: `${FRONTEND_URL}/auth/signup?token=client-invite`,
      message:
        'Saw your interest in strength training — would love to work together.',
    }),
  },
  {
    name: 'client/invitation-existing-user',
    subject: '[MotionHive Test] You have a client invitation (existing user)',
    html: clientInvitationExistingUserTemplate({
      recipientFirstName: 'Alex',
      instructorName: 'Coach Daniel',
      acceptLink: `${FRONTEND_URL}/profile?tab=coaches&requestId=req-1`,
      message: 'Following up on our chat — set you up as a client.',
    }),
  },
  {
    name: 'client/request-to-instructor',
    subject: '[MotionHive Test] New client request',
    html: clientRequestToInstructorTemplate({
      instructorFirstName: 'Daniel',
      clientName: 'Alex Rivera',
      reviewLink: `${FRONTEND_URL}/coaching/clients?requestId=req-1`,
      message:
        "Hi! I'd love to train with you — I'm focused on building strength for trail running.",
    }),
  },
  {
    name: 'client/request-accepted',
    subject: '[MotionHive Test] Client request accepted',
    html: clientRequestAcceptedTemplate({
      recipientFirstName: 'Alex',
      responderName: 'Coach Daniel',
      appLink: `${FRONTEND_URL}/profile?tab=coaches`,
    }),
  },
  {
    name: 'client/request-declined',
    subject: '[MotionHive Test] Client request update',
    html: clientRequestDeclinedTemplate({
      recipientFirstName: 'Alex',
      responderName: 'Coach Daniel',
    }),
  },
  {
    name: 'client/collaboration-ended',
    subject: '[MotionHive Test] Collaboration ended',
    html: collaborationEndedTemplate({
      recipientName: 'Alex',
      otherPartyName: 'Coach Daniel',
      endedBy: 'other',
      recipientRole: 'client',
    }),
  },

  // ─── Session (3) ───────────────────────────────────────────────────
  {
    name: 'session/reminder (UNWIRED — preview only)',
    subject: '[MotionHive Test] Session reminder',
    html: sessionReminderTemplate(
      'Alex',
      'Morning HIIT',
      'Coach Daniel',
      'Saturday, November 16 at 7:30 AM',
      'Riverside Park — main lawn',
    ),
  },
  {
    name: 'session/cancelled',
    subject: '[MotionHive Test] Session cancelled',
    html: sessionCancelledTemplate(
      'Alex',
      'Morning HIIT',
      'Coach Daniel',
      'Saturday, November 16 at 7:30 AM',
    ),
  },
  {
    name: 'session/participant-status',
    subject: '[MotionHive Test] Session status update',
    html: participantStatusTemplate(
      'Alex',
      'Morning HIIT',
      'CONFIRMED',
      'Saturday, November 16 at 7:30 AM',
    ),
  },

  // ─── Money (2) ─────────────────────────────────────────────────────
  {
    name: 'invoice/send',
    subject: '[MotionHive Test] You have a new invoice',
    html: invoiceSendTemplate({
      instructorName: 'Coach Daniel',
      amountLabel: '€120.00',
      dueDateLabel: 'November 30, 2026',
      invoiceNumber: 'INV-001234',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/preview/test',
      invoicePdfUrl: 'https://files.stripe.com/preview/test.pdf',
      recipientName: 'Alex',
    }),
  },
  {
    name: 'subscription/setup',
    subject: '[MotionHive Test] Confirm your membership',
    html: subscriptionSetupTemplate({
      instructorName: 'Coach Daniel',
      planName: 'Strength Foundations',
      amountLabel: '€80.00',
      cycleLabel: 'monthly',
      setupUrl: 'https://invoice.stripe.com/i/preview/setup',
      recipientName: 'Alex',
    }),
  },

  // ─── Notification (1) ──────────────────────────────────────────────
  {
    name: 'notification/generic',
    subject: '[MotionHive Test] New activity on your account',
    html: genericNotificationTemplate({
      title: 'New activity on your account',
      body: 'Coach Daniel sent you a new message about your training plan.',
      ctaUrl: `${FRONTEND_URL}/messages`,
      ctaLabel: 'Open messages',
    }),
  },
];

async function main(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing in .env — aborting');
    process.exit(1);
  }
  const fromName = process.env.EMAIL_FROM_NAME || 'MotionHive';
  const fromEmail = process.env.EMAIL_FROM || 'noreply@motionhive.fit';
  const from = `${fromName} <${fromEmail}>`;
  const resend = new Resend(apiKey);

  console.log(`Sending ${previews.length} preview emails to ${RECIPIENT}`);
  console.log(`From: ${from}\n`);

  const results: Array<{ name: string; ok: boolean; info: string }> = [];

  for (const p of previews) {
    process.stdout.write(`  ${p.name.padEnd(48)} `);
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: [RECIPIENT],
        subject: p.subject,
        html: p.html,
      });
      if (error) {
        console.log(`FAIL — ${error.message}`);
        results.push({ name: p.name, ok: false, info: error.message });
      } else {
        console.log(`OK    id=${data?.id}`);
        results.push({ name: p.name, ok: true, info: data?.id || '' });
      }
    } catch (err) {
      const reason = (err as Error).message;
      console.log(`THROW — ${reason}`);
      results.push({ name: p.name, ok: false, info: reason });
    }
    // Resend free tier is 2 req/sec — slow down enough that we never trip it.
    await new Promise((r) => setTimeout(r, 600));
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n${ok}/${results.length} sent. ${fail} failed.`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.info}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
