import OpenAI from "openai"
import type { SmartTaskDecision } from "./task-intelligence.service"
import { laurentReplyStyle } from "../config/laurent-style"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type AvailabilitySlot = {
  date: string
  weekday: string
  start: string
  end: string
}

type AIContext = {
  needsAvailability?: boolean
  availableSlots?: AvailabilitySlot[]
  availabilityText?: string | null
}

type GenerateAIReplyInput = {
  fromEmail: string
  subject: string
  body: string
  decision: SmartTaskDecision
  aiContext?: AIContext
}

function buildAvailabilityContext(aiContext?: AIContext) {
  if (!aiContext?.needsAvailability) {
    return `
Disponibilités :
Non applicable pour cette demande.
`.trim()
  }

  if (!aiContext.availableSlots || aiContext.availableSlots.length === 0) {
    return `
Disponibilités :
Aucun créneau disponible n’a été trouvé dans le calendrier pour la période analysée.

Instruction :
Ne propose pas de créneau précis.
Explique simplement que Laurent va vérifier les disponibilités et revenir vers le client.
`.trim()
  }

  return `
Disponibilités réelles trouvées dans le calendrier :
${aiContext.availabilityText}

Instruction :
Tu peux proposer uniquement ces créneaux.
Ne propose jamais d’autre date ou horaire.
Ne confirme jamais une réservation.
Demande au client quel créneau lui conviendrait le mieux.
`.trim()
}

function buildBusinessContext() {
  return `
Le Centre de Magie de la Côte est situé à Nyon.

Offres principales :
- cours de magie
- stages de magie
- anniversaires magiques
- animations à domicile
- animations entreprises
- escape games
- spectacles
- soirées magiques privées

Règles importantes :
- Ne jamais inventer un tarif.
- Ne jamais inventer une disponibilité.
- Ne jamais confirmer une réservation.
- Ne jamais promettre qu’un créneau est bloqué.
- Si le client demande une réservation, proposer une réponse prudente : "je peux vous proposer..." ou "nous avons actuellement les créneaux suivants..."
- Si une information manque, poser une question simple et directe.
- Pour une demande d’anniversaire, demander si nécessaire : âge de l’enfant, nombre d’enfants, date souhaitée, téléphone.
`.trim()
}

export async function generateAIReply(input: GenerateAIReplyInput) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans .env")
  }

  const availabilityContext = buildAvailabilityContext(input.aiContext)
  const businessContext = buildBusinessContext()

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Tu es l'assistant de Laurent Moreschi, responsable du Centre de Magie de la Côte à Nyon.

Objectif :
Rédiger une proposition de réponse email professionnelle, chaleureuse, claire et prête à être validée par Laurent.

Contraintes absolues :
- Ne jamais dire que tu es une IA.
- Ne jamais envoyer la réponse.
- Écrire en français.
- Ne jamais inventer une disponibilité.
- Ne jamais inventer un tarif.
- Ne jamais confirmer une réservation.
- Ne jamais dire qu’un créneau est réservé.
- Ne jamais ajouter de commentaire avant ou après la réponse.
- La réponse doit être directement prête à copier-coller dans Gmail.

Style de réponse à respecter :
${laurentReplyStyle}

${businessContext}

${availabilityContext}

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