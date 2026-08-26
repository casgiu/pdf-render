const ALERT_DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000;
const alertedErrors = new Map();

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function write(level, event, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "pdf-render",
    ...context,
  };
  const output = JSON.stringify(payload);

  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export const logger = {
  info(event, context) {
    write("info", event, context);
  },
  warn(event, context) {
    write("warn", event, context);
  },
  error(event, error, context = {}) {
    write("error", event, { ...context, error: serializeError(error) });
  },
};

function shouldSendAlert(event, error) {
  const key = `${event}:${error instanceof Error ? error.message : String(error)}`;
  const now = Date.now();
  const previous = alertedErrors.get(key);
  alertedErrors.set(key, now);

  for (const [candidate, timestamp] of alertedErrors) {
    if (now - timestamp > ALERT_DEDUPLICATION_WINDOW_MS) alertedErrors.delete(candidate);
  }

  return !previous || now - previous > ALERT_DEDUPLICATION_WINDOW_MS;
}

async function sendAlert(event, error, context) {
  const webhookUrl = process.env.ERROR_ALERT_WEBHOOK_URL;
  if (!webhookUrl || !shouldSendAlert(event, error)) return;

  const details = Object.entries(context)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
  const message = `[pdf-render] ${event}: ${error instanceof Error ? error.message : String(error)}${details ? ` (${details})` : ""}`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (alertError) {
    logger.error("error_alert_delivery_failed", alertError, { sourceEvent: event });
  }
}

/** Journalise une erreur et, si configurée, envoie une alerte HTTP compatible Slack. */
export function reportError(event, error, context = {}) {
  logger.error(event, error, context);
  void sendAlert(event, error, context);
}
