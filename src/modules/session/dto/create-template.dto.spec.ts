import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

const baseDto = () => ({
  title: 'Morning Yoga',
  type: 'OPEN',
  access: 'FREE',
  locationKind: 'IN_PERSON',
  durationMinutes: 30,
  timezone: 'Europe/Bucharest',
  isRecurring: false,
  firstStartAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
});

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateTemplateDto, payload);
  return validate(dto);
}

describe('CreateTemplateDto — Phase A guards', () => {
  it('A4: rejects firstStartAt in the past beyond 5min skew', async () => {
    const errors = await validateDto({
      ...baseDto(),
      firstStartAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    const firstStartErr = errors.find((e) => e.property === 'firstStartAt');
    expect(firstStartErr).toBeDefined();
    expect(JSON.stringify(firstStartErr)).toMatch(/future/i);
  });

  it('A5: accepts firstStartAt within 5min skew window (clock skew)', async () => {
    const errors = await validateDto({
      ...baseDto(),
      firstStartAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(errors).toEqual([]);
  });

  it('A7: rejects description > 4000 chars', async () => {
    const errors = await validateDto({
      ...baseDto(),
      description: 'x'.repeat(4001),
    });
    const descErr = errors.find((e) => e.property === 'description');
    expect(descErr).toBeDefined();
    expect(JSON.stringify(descErr)).toMatch(/4000/);
  });

  it('A8: rejects http:// meetingUrl (https-only)', async () => {
    const errors = await validateDto({
      ...baseDto(),
      locationKind: 'ONLINE',
      meetingUrl: 'http://meet.google.com/abc',
    });
    const urlErr = errors.find((e) => e.property === 'meetingUrl');
    expect(urlErr).toBeDefined();
  });

  it('A8b: accepts https:// meetingUrl', async () => {
    const errors = await validateDto({
      ...baseDto(),
      locationKind: 'ONLINE',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(errors).toEqual([]);
  });

  it('happy path: minimal valid DTO has no errors', async () => {
    const errors = await validateDto(baseDto());
    expect(errors).toEqual([]);
  });
});
