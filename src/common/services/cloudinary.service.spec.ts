import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

function makeService(cloudName: string | undefined): CloudinaryService {
  const config = {
    get: (key: string) => {
      if (key === 'CLOUDINARY_CLOUD_NAME') return cloudName;
      if (key === 'CLOUDINARY_API_KEY') return 'k';
      if (key === 'CLOUDINARY_API_SECRET') return 's';
      return undefined;
    },
  } as unknown as ConfigService;
  return new CloudinaryService(config);
}

describe('CloudinaryService.isOwnedUrl', () => {
  const svc = makeService('motionhive-prod');

  it('accepts an https URL on res.cloudinary.com under our cloud name', () => {
    expect(
      svc.isOwnedUrl(
        'https://res.cloudinary.com/motionhive-prod/image/upload/v1/posts/abc.png',
      ),
    ).toBe(true);
  });

  it('rejects a different Cloudinary cloud', () => {
    expect(
      svc.isOwnedUrl(
        'https://res.cloudinary.com/somebody-else/image/upload/v1/x.png',
      ),
    ).toBe(false);
  });

  it('rejects a non-Cloudinary host', () => {
    expect(svc.isOwnedUrl('https://evil.example.com/a.png')).toBe(false);
  });

  it('rejects http (non-TLS)', () => {
    expect(
      svc.isOwnedUrl(
        'http://res.cloudinary.com/motionhive-prod/image/upload/v1/x.png',
      ),
    ).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(svc.isOwnedUrl('not-a-url')).toBe(false);
    expect(svc.isOwnedUrl('')).toBe(false);
  });

  it('falls back to host-only check when cloud name is not configured', () => {
    const lax = makeService(undefined);
    expect(
      lax.isOwnedUrl('https://res.cloudinary.com/whatever/image/upload/x.png'),
    ).toBe(true);
    expect(lax.isOwnedUrl('https://evil.example.com/x.png')).toBe(false);
  });
});

describe('CloudinaryService.assertOwnedUrls', () => {
  const svc = makeService('motionhive-prod');

  it('passes when all URLs are owned', () => {
    expect(() =>
      svc.assertOwnedUrls([
        'https://res.cloudinary.com/motionhive-prod/image/upload/a.png',
      ]),
    ).not.toThrow();
  });

  it('throws when any URL is not owned', () => {
    expect(() =>
      svc.assertOwnedUrls([
        'https://res.cloudinary.com/motionhive-prod/image/upload/a.png',
        'https://evil.example.com/b.png',
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('CloudinaryService.extractPublicId', () => {
  const svc = makeService('motionhive-prod');

  it('extracts the publicId from a versioned URL with subfolders', () => {
    expect(
      svc.extractPublicId(
        'https://res.cloudinary.com/motionhive-prod/image/upload/v123/motionhive/prod/posts/u1/abc.png',
      ),
    ).toBe('motionhive/prod/posts/u1/abc');
  });

  it('handles transformations between upload and version', () => {
    expect(
      svc.extractPublicId(
        'https://res.cloudinary.com/motionhive-prod/image/upload/c_fill,w_300/v123/motionhive/prod/posts/u1/abc.jpg',
      ),
    ).toBe('motionhive/prod/posts/u1/abc');
  });

  it('handles the real q_auto/f_auto transformations our uploader emits', () => {
    expect(
      svc.extractPublicId(
        'https://res.cloudinary.com/motionhive-prod/image/upload/f_auto,q_auto/v1700000000/motionhive/development/posts/2762e1d6-8a6d-4fc4-9aa0-2ff24106018c/abcdef.jpg',
      ),
    ).toBe(
      'motionhive/development/posts/2762e1d6-8a6d-4fc4-9aa0-2ff24106018c/abcdef',
    );
  });

  it('returns null for a URL outside our cloud', () => {
    expect(
      svc.extractPublicId(
        'https://res.cloudinary.com/somebody-else/image/upload/v1/x.png',
      ),
    ).toBeNull();
  });

  it('returns null for non-Cloudinary URLs', () => {
    expect(svc.extractPublicId('https://evil.example.com/x.png')).toBeNull();
    expect(svc.extractPublicId('not-a-url')).toBeNull();
    expect(svc.extractPublicId('')).toBeNull();
  });
});
