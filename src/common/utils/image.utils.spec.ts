import { isSupportedImage } from './image.utils';

describe('isSupportedImage', () => {
  it('accepts a JPEG header', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  it('accepts a PNG header', () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  it('accepts GIF87a and GIF89a', () => {
    const gif87 = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0,
    ]);
    const gif89 = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0,
    ]);
    expect(isSupportedImage(gif87)).toBe(true);
    expect(isSupportedImage(gif89)).toBe(true);
  });

  it('accepts a WEBP container', () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  it('rejects an empty buffer', () => {
    expect(isSupportedImage(Buffer.alloc(0))).toBe(false);
  });

  it('rejects a buffer that is too short', () => {
    expect(isSupportedImage(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('rejects a PE/EXE header (MZ) labeled as image', () => {
    const buf = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    ]);
    expect(isSupportedImage(buf)).toBe(false);
  });

  it('rejects an SVG (text-based, XSS vector)', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(isSupportedImage(buf)).toBe(false);
  });
});
