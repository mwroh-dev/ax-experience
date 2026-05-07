import { extract_identifiers } from './retriever';

describe('extract_identifiers', () => {
  it('extracts order_id from Korean message', () => {
    const { order_id } = extract_identifiers('주문번호 12345 환불해주세요');
    expect(order_id).toBe('12345');
  });
  it('extracts order_id from English message', () => {
    const { order_id } = extract_identifiers('Order #67890 is delayed');
    expect(order_id).toBe('67890');
  });
  it('extracts email from message', () => {
    const { email } = extract_identifiers('my email is test@example.com thanks');
    expect(email).toBe('test@example.com');
  });
  it('returns undefined when no identifiers found', () => {
    const { order_id, email } = extract_identifiers('안녕하세요, 영업시간이?');
    expect(order_id).toBeUndefined();
    expect(email).toBeUndefined();
  });
});
