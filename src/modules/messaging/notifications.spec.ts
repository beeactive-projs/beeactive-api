import { NotificationType } from '../notification/notification.service';
import { messageReceived } from './notifications';

describe('messaging notifications builder — Stage 6', () => {
  const base = {
    recipientId: 'recipient-id',
    conversationId: 'conv-id',
    senderName: 'Alice Smith',
    preview: 'See you at 5pm',
    suppressEmail: false,
    hidePreviewInEmail: false,
  };

  it('builds a MESSAGE_RECEIVED NotifyParams with correct deep-link', () => {
    const p = messageReceived(base);
    expect(p.userId).toBe('recipient-id');
    expect(p.type).toBe(NotificationType.MESSAGE_RECEIVED);
    expect(p.data?.screen).toBe('messages');
    expect(p.data?.queryParams).toEqual({ conversationId: 'conv-id' });
    expect(p.ctaLabel).toBe('Open conversation');
  });

  it('uses "Someone" when senderName is null', () => {
    const p = messageReceived({ ...base, senderName: null });
    expect(p.title).toContain('Someone');
    expect(p.body).toContain('Someone');
  });

  it('truncates the preview to 80 chars with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const p = messageReceived({ ...base, preview: long });
    // The preview portion (post "Alice Smith: ") has length 80 max.
    const previewPart = p.body.split(': ').slice(1).join(': ');
    expect(previewPart.length).toBe(80);
    expect(previewPart.endsWith('…')).toBe(true);
  });

  it('escapes HTML in sender name and preview body', () => {
    const p = messageReceived({
      ...base,
      senderName: 'Alice <script>',
      preview: 'try <img src=x onerror=alert(1)>',
    });
    expect(p.title).not.toContain('<script>');
    expect(p.body).not.toContain('<img');
    expect(p.body).toContain('&lt;');
  });

  it('omits the preview when hidePreviewInEmail=true', () => {
    const p = messageReceived({ ...base, hidePreviewInEmail: true });
    expect(p.body).not.toContain('See you at 5pm');
    expect(p.body).toContain('sent you a new message');
  });

  it('always suppresses in_app; turns email off when suppressEmail=true', () => {
    // First-in-window: in_app stays off (bell would duplicate the
    // sidebar Messages badge), email goes through.
    expect(
      messageReceived({ ...base, suppressEmail: false }).channelOverride,
    ).toEqual({ in_app: false, email: true });

    // After the hour-window cap fires: both channels off, the recipient
    // already has the live unread indicator on the sidebar + the
    // earlier email for that conversation.
    expect(
      messageReceived({ ...base, suppressEmail: true }).channelOverride,
    ).toEqual({ in_app: false, email: false });
  });
});
