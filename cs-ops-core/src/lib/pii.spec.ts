import { mask_pii } from './pii';

describe('mask_pii', () => {
  it('masks email address', () => {
    expect(mask_pii('contact: user@example.com')).toBe('contact: us**@example.com');
  });
  it('masks phone number', () => {
    expect(mask_pii('전화: 010-1234-5678')).toBe('전화: ***-****');
  });
  it('leaves already-masked email alone', () => {
    const masked = 'us**@example.com';
    expect(mask_pii(masked)).toBe(masked);
  });
  it('passes through clean text', () => {
    expect(mask_pii('no pii here')).toBe('no pii here');
  });
});
