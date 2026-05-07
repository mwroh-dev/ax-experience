import { register_messages } from './messages';
import { config } from '@api/config';

const mock_pipeline = jest.fn().mockResolvedValue({ ok: true, value: {}, trace: [] });
jest.mock('@cs-ops-core/pipeline', () => ({ process_cs_message: (...args: any[]) => mock_pipeline(...args) }));

const CS_CHANNEL = 'C_CS_EVENTS';

function make_app() {
  let handler: Function | undefined;
  const app = {
    message: (h: Function) => { handler = h; },
    _trigger: async (event: object) => handler?.({ message: event }),
  };
  return app as any;
}

describe('register_messages', () => {
  let app: ReturnType<typeof make_app>;

  beforeEach(() => {
    app = make_app();
    (config.slack as any).cs_events_channel = CS_CHANNEL;
    mock_pipeline.mockClear();
  });

  afterEach(() => {
    (config.slack as any).cs_events_channel = '';
  });

  it('message in CS channel → calls process_cs_message', async () => {
    register_messages(app);
    await app._trigger({ type: 'message', channel: CS_CHANNEL, text: '배송 조회해주세요', ts: '111.222' });
    expect(mock_pipeline).toHaveBeenCalledWith('배송 조회해주세요', '111.222');
  });

  it('message in wrong channel → ignored', async () => {
    register_messages(app);
    await app._trigger({ type: 'message', channel: 'C_OTHER', text: '배송 조회', ts: '111.223' });
    expect(mock_pipeline).not.toHaveBeenCalled();
  });

  it('message with subtype (bot_message) → ignored', async () => {
    register_messages(app);
    await app._trigger({ type: 'message', channel: CS_CHANNEL, subtype: 'bot_message', text: 'bot reply', ts: '111.224' });
    expect(mock_pipeline).not.toHaveBeenCalled();
  });

  it('empty text → ignored', async () => {
    register_messages(app);
    await app._trigger({ type: 'message', channel: CS_CHANNEL, text: '', ts: '111.225' });
    expect(mock_pipeline).not.toHaveBeenCalled();
  });

  it('cs_events_channel not configured → all messages ignored', async () => {
    (config.slack as any).cs_events_channel = '';
    register_messages(app);
    await app._trigger({ type: 'message', channel: CS_CHANNEL, text: '테스트', ts: '111.226' });
    expect(mock_pipeline).not.toHaveBeenCalled();
  });
});
