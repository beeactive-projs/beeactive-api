import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  primaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Instructor-suggestion email. A MotionHive user thinks a particular
 * coach should be on the platform; the email goes to that coach's
 * inbox with a sign-up link for the instructor flow.
 *
 * Personalized: it names the user who recommended them so the
 * recipient sees it's not a cold pitch from MotionHive itself.
 */
export function instructorSuggestionTemplate(params: {
  coachName: string;
  recommenderName: string;
  signUpLink: string;
  note?: string;
}): string {
  const { coachName, recommenderName, signUpLink, note } = params;
  const safeCoach = escapeHtml(coachName);
  const safeRecommender = escapeHtml(recommenderName);
  const safeNote = escapeHtml(note);

  const content = `
    ${eyebrow('SUGGESTION', 'action')}
    ${heading(`Hey ${safeCoach} — someone thinks you'd be a great fit here`)}
    ${subheading(`${safeRecommender} suggested you join MotionHive`)}
    ${personCard({ name: recommenderName, role: 'Suggested you' })}
    ${paragraph(`<strong>${safeRecommender}</strong> uses MotionHive and recommended you as a coach worth having on the platform. We'd love to have you.`)}
    ${note ? calloutBox('info', `<em>"${safeNote}"</em>`) : ''}
    ${primaryButton('Set up your coach profile', signUpLink)}
    ${securityNote("If this isn't for you, no worries — just ignore this email.")}
  `;

  return baseLayout(content, {
    preheader: `${recommenderName} suggested you join MotionHive`,
    category: 'action',
  });
}

export function instructorSuggestionTemplateText(params: {
  coachName: string;
  recommenderName: string;
  signUpLink: string;
  note?: string;
}): string {
  const { coachName, recommenderName, signUpLink, note } = params;
  return plainTextLayout({
    preheader: `${recommenderName} suggested you join MotionHive`,
    sections: [
      {
        heading: `${coachName} — someone thinks you'd be a great fit here`,
        body: [
          `${recommenderName} uses MotionHive and recommended you as a coach worth having on the platform. We'd love to have you.`,
          ...(note ? [`Note: "${note}"`] : []),
        ],
        ctas: [{ label: 'Set up your coach profile', url: signUpLink }],
      },
      {
        body: ["If this isn't for you, no worries — just ignore this email."],
      },
    ],
  });
}
