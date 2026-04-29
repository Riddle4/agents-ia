import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function extractDateRangeFromText(text: string) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
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
${text}

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