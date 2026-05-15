import OpenAI from "openai"
import { normalizeIncomingEmailBody } from "./email-body-normalizer.service"

let openai: OpenAI | null = null

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return openai
}

export async function extractDateRangeFromText(text: string) {
  const client = getOpenAIClient()

  if (!client) {
    return null
  }

  const normalizedText = normalizeIncomingEmailBody(text)

  const response = await client.responses.create({
    model: process.env.ECHO_DATE_MODEL || "gpt-5",
    input: `
Tu es un expert en extraction de dates.

Analyse ce message client et retourne un JSON STRICT avec :
- startDate (ISO)
- endDate (ISO)

Règles :
- Si le client dit "mai", retourne du 1er mai au 31 mai de cette année
- Si "mai et juin", retourne 1 mai → 30 juin
- Si aucune date claire : retourne null

Message :
${normalizedText}

Répond uniquement avec un JSON.
    `.trim(),
  })

  try {
    const json = JSON.parse(response.output_text)
    return json
  } catch {
    return null
  }
}
