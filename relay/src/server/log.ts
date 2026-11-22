// Plain, timestamped log lines. When the app runs as a background service these end up in logs/app.log.
const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const log = (message: string) => console.log(`[${stamp()}] ${message}`);

/** Logs a problem with enough detail to diagnose it, without dumping whole objects. */
export function logError(where: string, error: unknown) {
  const e = error as { message?: string; stack?: string; cause?: { message?: string } };
  const detail = e?.cause?.message ? `${e.message} (${e.cause.message})` : (e?.message ?? String(error));
  console.error(`[${stamp()}] ERROR ${where}: ${detail}`);
  // A stack trace helps only for unexpected faults; keep it to the first few frames.
  if (e?.stack && !/PlatformError|AgentError|PostError/.test(e.stack.split('\n')[0])) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
}
