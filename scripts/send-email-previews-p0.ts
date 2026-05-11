/**
 * Preview send for the 6 new P0 emails (the gap-filling batch).
 * Subjects prefixed "[MotionHive Test — P0]" so they're distinct
 * from the earlier preview batches in the inbox.
 *
 * Coverage:
 *   1. auth/password-changed
 *   2. group/member-left          (the user's explicit ask)
 *   3. group/member-removed
 *   4. group/join-request-received
 *   5. group/ownership-transferred (received variant)
 *   6. group/ownership-transferred (transferred variant)
 *   7. session/rescheduled
 */

import 'dotenv/config';
import { Resend } from 'resend';
import {
  groupJoinRequestReceivedTemplate,
  groupMemberLeftTemplate,
  groupMemberRemovedTemplate,
  groupOwnershipTransferredTemplate,
  passwordChangedTemplate,
  sessionRescheduledTemplate,
} from '../src/common/email';

const RECIPIENT = 'user@motionhive.fit';
const FRONTEND_URL = 'https://app.motionhive.fit';
const GROUP_ID = 'preview-group-id';
const REQUEST_ID = 'preview-request-id';

async function main(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing in .env');
    process.exit(1);
  }
  const from = `${process.env.EMAIL_FROM_NAME || 'MotionHive'} <${process.env.EMAIL_FROM || 'noreply@motionhive.fit'}>`;
  const resend = new Resend(apiKey);

  const previews = [
    {
      name: 'auth/password-changed',
      subject: '[MotionHive Test — P0] Your password was changed',
      html: passwordChangedTemplate({
        firstName: 'Alex',
        changedAtLabel: 'Tue, May 11, 2026, 4:15 PM PDT',
        resetLink: `${FRONTEND_URL}/auth/reset-password`,
      }),
    },
    {
      name: 'group/member-left (owner side)',
      subject: '[MotionHive Test — P0] A member left your group',
      html: groupMemberLeftTemplate({
        ownerFirstName: 'Maria',
        memberName: 'Alex Rivera',
        groupName: 'Sunrise Pilates',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
      }),
    },
    {
      name: 'group/member-removed (member side)',
      subject: '[MotionHive Test — P0] You were removed from a group',
      html: groupMemberRemovedTemplate({
        memberFirstName: 'Alex',
        groupName: 'Sunrise Pilates',
        groupsListLink: `${FRONTEND_URL}/groups`,
      }),
    },
    {
      name: 'group/join-request-received (owner side)',
      subject: '[MotionHive Test — P0] New request to join your group',
      html: groupJoinRequestReceivedTemplate({
        ownerFirstName: 'Maria',
        requesterName: 'Sam Patel',
        groupName: 'Sunrise Pilates',
        reviewLink: `${FRONTEND_URL}/groups/${GROUP_ID}/members?requestId=${REQUEST_ID}`,
        message:
          'Hi! Found you via the discover page — would love to join your morning sessions.',
      }),
    },
    {
      name: 'group/ownership-transferred (received variant)',
      subject: "[MotionHive Test — P0] You're now the group owner",
      html: groupOwnershipTransferredTemplate({
        direction: 'received',
        recipientFirstName: 'Sam',
        otherPartyName: 'Maria Chen',
        groupName: 'Sunrise Pilates',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
      }),
    },
    {
      name: 'group/ownership-transferred (transferred variant)',
      subject: '[MotionHive Test — P0] You transferred ownership',
      html: groupOwnershipTransferredTemplate({
        direction: 'transferred',
        recipientFirstName: 'Maria',
        otherPartyName: 'Sam Patel',
        groupName: 'Sunrise Pilates',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
      }),
    },
    {
      name: 'session/rescheduled',
      subject: '[MotionHive Test — P0] Session rescheduled',
      html: sessionRescheduledTemplate({
        participantName: 'Alex',
        sessionTitle: 'Morning HIIT',
        instructorName: 'Coach Daniel',
        oldScheduledAtLabel: 'Saturday, November 16, 2026, 7:30 AM',
        newScheduledAtLabel: 'Sunday, November 17, 2026, 8:00 AM',
        reason: 'Heavy rain forecast for Saturday — moving to Sunday morning.',
      }),
    },
  ];

  console.log(`Sending ${previews.length} P0 preview emails to ${RECIPIENT}\n`);
  for (const p of previews) {
    process.stdout.write(`  ${p.name.padEnd(58)} `);
    try {
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
    } catch (err) {
      console.log(`THROW — ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
