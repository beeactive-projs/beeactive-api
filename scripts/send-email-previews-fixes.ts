/**
 * Resends ONLY the templates whose URLs were just fixed:
 *   - group/invitation        (was 404 → now /join/<token>)
 *   - client/request-to-instructor (was wrong page → now /coaching/pending-requests?requestId=)
 *
 * Subjects are prefixed "[MotionHive Test — FIX]" so they're easy to
 * tell apart from the original preview batch.
 */

import 'dotenv/config';
import { Resend } from 'resend';
import {
  clientRequestToInstructorTemplate,
  invitationTemplate,
} from '../src/common/email';

const RECIPIENT = 'user@motionhive.fit';

async function main(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing in .env');
    process.exit(1);
  }
  const from = `${process.env.EMAIL_FROM_NAME || 'MotionHive'} <${process.env.EMAIL_FROM || 'noreply@motionhive.fit'}>`;
  const resend = new Resend(apiKey);

  const frontendUrl = 'https://app.motionhive.fit';

  const previews = [
    {
      name: 'group/invitation (FIXED: /join/<token>)',
      subject: '[MotionHive Test — FIX] Group invitation',
      html: invitationTemplate(
        'Maria Chen',
        'Sunrise Pilates',
        `${frontendUrl}/join/inv-token-abc123`,
        "I think you'd love this group — we train Tue/Thu mornings.",
      ),
    },
    {
      name: 'client/request-to-instructor (FIXED: pending-requests)',
      subject: '[MotionHive Test — FIX] New client request',
      html: clientRequestToInstructorTemplate({
        instructorFirstName: 'Daniel',
        clientName: 'Alex Rivera',
        reviewLink: `${frontendUrl}/coaching/pending-requests?requestId=req-1`,
        message:
          "Hi! I'd love to train with you — I'm focused on building strength for trail running.",
      }),
    },
  ];

  console.log(
    `Sending ${previews.length} FIXED preview emails to ${RECIPIENT}\n`,
  );
  for (const p of previews) {
    process.stdout.write(`  ${p.name.padEnd(60)} `);
    const { data, error } = await resend.emails.send({
      from,
      to: [RECIPIENT],
      subject: p.subject,
      html: p.html,
    });
    if (error) {
      console.log(`FAIL — ${error.message}`);
    } else {
      console.log(`OK   id=${data?.id}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
