import { MessagingStreamAckService } from './messaging-stream-ack.service';

describe('MessagingStreamAckService — Stage 7', () => {
  let service: MessagingStreamAckService;

  beforeEach(() => {
    service = new MessagingStreamAckService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('returns null before any ack has been recorded', () => {
    expect(service.getLastAck('u')).toBeNull();
  });

  it('records and returns the last ack', () => {
    service.recordAck('u', 'evt-42');
    expect(service.getLastAck('u')?.lastEventId).toBe('evt-42');
  });

  it('later acks overwrite earlier ones', () => {
    service.recordAck('u', 'evt-1');
    service.recordAck('u', 'evt-2');
    expect(service.getLastAck('u')?.lastEventId).toBe('evt-2');
  });

  it('isolates users from each other', () => {
    service.recordAck('alice', 'evt-a');
    service.recordAck('bob', 'evt-b');
    expect(service.getLastAck('alice')?.lastEventId).toBe('evt-a');
    expect(service.getLastAck('bob')?.lastEventId).toBe('evt-b');
  });

  it('expires entries after TTL — getLastAck returns null and clears them', () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      service.recordAck('u', 'evt-1');
      fakeNow += MessagingStreamAckService.ACK_TTL_MS + 1;
      expect(service.getLastAck('u')).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
