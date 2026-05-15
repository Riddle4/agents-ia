const DEFAULT_MAX_EMAIL_BODY_CHARS = 12000

function getMaxEmailBodyChars() {
  const value = Number(process.env.ECHO_MAX_EMAIL_BODY_CHARS || DEFAULT_MAX_EMAIL_BODY_CHARS)

  if (!Number.isInteger(value) || value < 2000) {
    return DEFAULT_MAX_EMAIL_BODY_CHARS
  }

  return value
}

function stripQuotedLines(text: string) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
}

function findQuotedHistoryIndex(text: string) {
  const markers = [
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^-{2,}\s*Message transféré\s*-{2,}$/im,
    /^Begin forwarded message:$/im,
    /^On .+ wrote:$/im,
    /^Le .+ a écrit\s*:$/im,
    /^De\s*:\s*.+$/im,
    /^From\s*:\s*.+$/im,
    /^Envoyé\s*:\s*.+$/im,
    /^Sent\s*:\s*.+$/im,
  ]

  const indexes = markers
    .map((marker) => text.search(marker))
    .filter((index) => index > 0)

  if (indexes.length === 0) {
    return -1
  }

  return Math.min(...indexes)
}

function compactWhitespace(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function normalizeIncomingEmailBody(body: string) {
  const maxChars = getMaxEmailBodyChars()
  const cleaned = compactWhitespace(stripQuotedLines(String(body || '')))
  const quotedHistoryIndex = findQuotedHistoryIndex(cleaned)
  const latestMessage =
    quotedHistoryIndex === -1
      ? cleaned
      : cleaned.slice(0, quotedHistoryIndex).trim()

  if (latestMessage.length <= maxChars) {
    return latestMessage
  }

  return `${latestMessage.slice(0, maxChars).trim()}

[Note interne Echo : le message original était très long. L'historique ou la fin du contenu a été tronqué automatiquement pour permettre l'analyse IA.]`
}
