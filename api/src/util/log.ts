const SLACK_ID = /\b([UCBT][A-Z0-9]{8,})\b/g;
const ABS_PATH = /\/Users\/[^/\s"]+/g;
const SECRET_TOKEN = /\b(ntn_[A-Za-z0-9]{10,}|xox[bpsa]-[A-Za-z0-9\-]+|xapp-[A-Za-z0-9\-]+|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9\-_]{30,})\b/g;

export function mask(value: string): string {
  return value
    .replace(SECRET_TOKEN, '[TOKEN]')
    .replace(ABS_PATH, '[LOCAL_PATH]')
    .replace(SLACK_ID, (m) => {
      if (m.startsWith('C')) return '[CHANNEL_ID]';
      if (m.startsWith('U')) return '[USER_ID]';
      if (m.startsWith('T')) return '[TEAM_ID]';
      if (m.startsWith('B')) return '[BOT_ID]';
      return '[SLACK_ID]';
    });
}
