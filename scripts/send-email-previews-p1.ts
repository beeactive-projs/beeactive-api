/**
 * Preview send for the P1 emails.
 *   1. group/join-request-decided (approved variant)
 *   2. group/join-request-decided (rejected variant)
 *   3. group/invitation-declined
 *   4. group/role-changed (promoted to moderator)
 *   5. group/role-changed (demoted to member)
 *
 * Subjects prefixed "[MotionHive Test — P1]".
 */

import 'dotenv/config';
import { Resend } from 'resend';
import {
  groupJoinRequestDecidedTemplate,
  groupRoleChangedTemplate,
  invitationDeclinedTemplate,
} from '../src/common/email';

const RECIPIENT = 'user@motionhive.fit';
const FRONTEND_URL = 'https://app.motionhive.fit';
const GROUP_ID = 'preview-group-id';

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
      name: 'group/join-request-decided (approved)',
      subject: "[MotionHive Test — P1] You're in — request approved",
      html: groupJoinRequestDecidedTemplate({
        decision: 'approved',
        requesterFirstName: 'Alex',
        groupName: 'Sunrise Pilates',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
        groupsListLink: `${FRONTEND_URL}/groups/discover`,
      }),
    },
    {
      name: 'group/join-request-decided (rejected)',
      subject: '[MotionHive Test — P1] Update on your join request',
      html: groupJoinRequestDecidedTemplate({
        decision: 'rejected',
        requesterFirstName: 'Alex',
        groupName: 'Sunrise Pilates',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
        groupsListLink: `${FRONTEND_URL}/groups/discover`,
      }),
    },
    {
      name: 'group/invitation-declined (inviter side)',
      subject: '[MotionHive Test — P1] Invitation declined',
      html: invitationDeclinedTemplate('Maria', 'Sam Patel', 'Sunrise Pilates'),
    },
    {
      name: 'group/role-changed (promoted to moderator)',
      subject: '[MotionHive Test — P1] You are now a moderator',
      html: groupRoleChangedTemplate({
        memberFirstName: 'Alex',
        groupName: 'Sunrise Pilates',
        oldRoleLabel: 'Member',
        newRoleLabel: 'Moderator',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
      }),
    },
    {
      name: 'group/role-changed (demoted back to member)',
      subject: '[MotionHive Test — P1] Your role changed to member',
      html: groupRoleChangedTemplate({
        memberFirstName: 'Alex',
        groupName: 'Sunrise Pilates',
        oldRoleLabel: 'Moderator',
        newRoleLabel: 'Member',
        groupLink: `${FRONTEND_URL}/groups/${GROUP_ID}`,
      }),
    },
  ];

  console.log(`Sending ${previews.length} P1 preview emails to ${RECIPIENT}\n`);
  for (const p of previews) {
    process.stdout.write(`  ${p.name.padEnd(56)} `);
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
