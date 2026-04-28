import OpenAI from "openai"
import type { SmartTaskDecision } from "./task-intelligence.service"
import { laurentReplyStyle } from "../config/laurent-style"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type GenerateAIReplyInput = {
  fromEmail: string
  subject: string
  body: string
  decision: SmartTaskDecision
}

export async function generateAIReply(input: GenerateAIReplyInput) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans .env")
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Tu es l'assistant de Laurent Moreschi, responsable du Centre de Magie de la Côte à Nyon.

Objectif :
Rédiger une proposition de réponse email professionnelle, chaleureuse, claire et prête à être validée par Laurent.

Important :
- Ne jamais dire que tu es une IA.
- Ne jamais envoyer la réponse.
- Écrire en français.
- Ne jamais inventer une disponibilité.
- Ne jamais inventer un tarif.
- Ne jamais confirmer une réservation.
- Si une information manque, la demander simplement.
- La réponse doit être prête à copier-coller dans Gmail.
- Ne pas ajouter de commentaire avant ou après la réponse.

Style de réponse à respecter :
${laurentReplyStyle}

Contexte métier :
Le Centre de Magie de la Côte propose notamment :
- cours de magie
- stages de magie
- anniversaires magiques
- animations à domicile
- animations entreprises
- escape games
- spectacles
- soirées magiques privées

Analyse interne :
Type de tâche : ${input.decision.taskType}
Priorité : ${input.decision.priority}
Titre : ${input.decision.title}

Email client :
De : ${input.fromEmail}
Sujet : ${input.subject}

Message :
${input.body}

Rédige uniquement la réponse email proposée.
    `.trim(),
  })

  return response.output_text.trim()
}