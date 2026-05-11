/**
 * Verify the header/footer navy now matches the logo PNG's square
 * background (sampled as #0e1b31). One render per category so we see
 * the result across heroBand-present and heroBand-absent layouts.
 *
 * Subjects prefixed "[MotionHive Test — LOGO MATCH]" to filter from
 * earlier preview batches.
 */

import 'dotenv/config';
import { Resend } from 'resend';
import {
  emailVerificationTemplate, // action — has hero band
  welcomeTemplate, // confirmation — no hero band
  clientRequestToInstructorTemplate, // request — coral accent
} from '../src/common/email';

const RECIPIENT = 'user@motionhive.fit';
const FRONTEND_URL = 'https://app.motionhive.fit';

async function main(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing');
    process.exit(1);
  }
  const from = `${process.env.EMAIL_FROM_NAME || 'MotionHive'} <${process.env.EMAIL_FROM || 'noreply@motionhive.fit'}>`;
  const resend = new Resend(apiKey);

  const previews = [
    {
      name: 'auth/email-verification (action, with hero band)',
      subject: '[MotionHive Test — LOGO MATCH] Verify your email',
      html: emailVerificationTemplate(
        `${FRONTEND_URL}/auth/verify-email?token=verify-token`,
      ),
    },
    {
      name: 'auth/welcome (confirmation, no hero band)',
      subject: '[MotionHive Test — LOGO MATCH] Welcome to MotionHive',
      html: welcomeTemplate('Alex', FRONTEND_URL),
    },
    {
      name: 'client/request-to-instructor (request, coral accent)',
      subject: '[MotionHive Test — LOGO MATCH] New client request',
      html: clientRequestToInstructorTemplate({
        instructorFirstName: 'Daniel',
        clientName: 'Alex Rivera',
        reviewLink: `${FRONTEND_URL}/coaching/pending-requests?requestId=req-1`,
        message: 'Hi! Would love to train with you.',
      }),
    },
  ];

  console.log(
    `Sending ${previews.length} logo-match previews to ${RECIPIENT}\n`,
  );
  for (const p of previews) {
    process.stdout.write(`  ${p.name.padEnd(58)} `);
    const { data, error } = await resend.emails.send({
      from,
      to: [RECIPIENT],
      subject: p.subject,
      html: p.html,
    });
    console.log(error ? `FAIL — ${error.message}` : `OK   id=${data?.id}`);
    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
