// Session domain enums — single source of truth used by entities, DTOs, and services.
// Defined as const + type (runtime accessible + TypeScript narrowing).

export const SessionType = {
  Group: 'GROUP',
  Private: 'PRIVATE',
  Open: 'OPEN',
} as const;
export type SessionType = (typeof SessionType)[keyof typeof SessionType];

export const SessionAccess = {
  Open: 'OPEN',
  ClientsOnly: 'CLIENTS_ONLY',
  GroupOnly: 'GROUP_ONLY',
  Free: 'FREE',
} as const;
export type SessionAccess = (typeof SessionAccess)[keyof typeof SessionAccess];

export const SessionLocationKind = {
  InPerson: 'IN_PERSON',
  Online: 'ONLINE',
} as const;
export type SessionLocationKind =
  (typeof SessionLocationKind)[keyof typeof SessionLocationKind];

export const SessionMeetingProvider = {
  Zoom: 'ZOOM',
  GoogleMeet: 'GOOGLE_MEET',
  Teams: 'TEAMS',
} as const;
export type SessionMeetingProvider =
  (typeof SessionMeetingProvider)[keyof typeof SessionMeetingProvider];

export const SessionTemplateStatus = {
  Active: 'ACTIVE',
  Ended: 'ENDED',
  Cancelled: 'CANCELLED',
} as const;
export type SessionTemplateStatus =
  (typeof SessionTemplateStatus)[keyof typeof SessionTemplateStatus];

export const SessionInstanceStatus = {
  Scheduled: 'SCHEDULED',
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
} as const;
export type SessionInstanceStatus =
  (typeof SessionInstanceStatus)[keyof typeof SessionInstanceStatus];

export const SessionParticipantStatus = {
  PendingApproval: 'PENDING_APPROVAL',
  Confirmed: 'CONFIRMED',
  Waitlisted: 'WAITLISTED',
  Cancelled: 'CANCELLED',
  Declined: 'DECLINED',
} as const;
export type SessionParticipantStatus =
  (typeof SessionParticipantStatus)[keyof typeof SessionParticipantStatus];

export const SessionReminderKind = {
  Reminder24h: 'REMINDER_24H',
  Reminder1h: 'REMINDER_1H',
} as const;
export type SessionReminderKind =
  (typeof SessionReminderKind)[keyof typeof SessionReminderKind];
