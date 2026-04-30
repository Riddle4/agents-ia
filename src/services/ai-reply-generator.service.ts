import OpenAI from "openai"
import type { SmartTaskDecision } from "./task-intelligence.service"
import { laurentReplyStyle } from "../config/laurent-style"
import { classifyRequest } from "./request-classifier.service"
import { getBusinessTemplate } from "./reply-templates.service"

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

function normalizeSignature(reply: string) {
  if (!reply) return ""

  const finalSignature = `Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte`

  let cleaned = reply.trim()

  const signatureIndex = cleaned.search(/Salutations magiques/i)
  if (signatureIndex !== -1) {
    cleaned = cleaned.slice(0, signatureIndex).trim()
  }

  cleaned = cleaned
    .replace(/^Laurent\s*$/gim, "")
    .replace(/^L['’]?Equipe du Centre de Magie de la Côte\s*$/gim, "")
    .replace(/^L['’]?Équipe du Centre de Magie de la Côte\s*$/gim, "")
    .replace(/^L'équipe du Centre de Magie de la Côte\s*$/gim, "")
    .replace(/^L’Equipe du Centre de Magie de la Côte\s*$/gim, "")
    .replace(/^Cordialement,?\s*$/gim, "")
    .replace(/^Bien à vous,?\s*$/gim, "")
    .trim()

  return `${cleaned}

${finalSignature}`
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
Explique simplement que nous allons vérifier les disponibilités et revenir vers le client.
`.trim()
  }

  return `
Disponibilités réelles trouvées dans le calendrier :
${aiContext.availabilityText}

Instructions :
- Tu peux proposer uniquement ces créneaux.
- Ne propose jamais d’autre date ou horaire.
- Ne confirme jamais une réservation.
- Ne dis jamais qu’un créneau est réservé ou bloqué.
- Lorsque tu listes des disponibilités, indique uniquement l’heure de début.
- Exemple : "samedi 6 juin à 10h00, 13h15 ou 15h45", pas "10h00 à 12h00".
- Demande au client quel créneau lui conviendrait le mieux.
`.trim()
}

function buildBusinessContext() {
  return `
Le Centre de Magie de la Côte est situé à Nyon.

Services proposés :
- Anniversaires pour enfants
- Cours de magie collectifs enfants à Genève, Nyon, Morges et Martigny, dès 7 ans
- Stages de magie : Pâques, vacances d'été, vacances d'automne / Halloween
- Escape Games à Nyon : L'École des Sorciers et La Pierre Philosophale
- Boutique de magie à Nyon, ouverte sur rendez-vous
- Cours de magie dans certaines écoles privées de la région : Collège du Léman, Mont-Olivet, École Internationale de Genève et École Moser
- Pool de magiciens professionnels pour animations privées, entreprises ou institutions
- Soirées Magiques Privées avec privatisation des locaux, accueil, apéritif et spectacle exclusif dans le petit théâtre

Documents envoyés fréquemment :
- Formulaire de réservation d'un anniversaire magique
- Formulaire d'inscription aux cours collectifs enfants
- Formulaire d'inscription aux stages magiques
- Formulaire de réservation d'une Soirée Magique Privée

Règles importantes :
- Ne jamais inventer un tarif.
- Ne jamais inventer une disponibilité.
- Ne jamais confirmer une réservation.
- Ne jamais promettre qu’un créneau est bloqué.
- Si le client demande une réservation, répondre prudemment : "nous pouvons actuellement vous proposer..." ou "ce créneau est encore libre pour le moment".
- Si une information manque, poser une question simple et directe.
- Pour une demande d’anniversaire, demander si nécessaire : âge de l’enfant, nombre d’enfants, date souhaitée, téléphone.
- Pour une demande d’anniversaire, toujours mentionner le formulaire de réservation en pièce jointe.
- Pour une animation externe, demander les précisions nécessaires avant de proposer une offre.
`.trim()
}

export async function generateAIReply(input: GenerateAIReplyInput) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans .env")
  }

  const requestType = classifyRequest(input.subject, input.body)

  const businessTemplate = getBusinessTemplate(requestType, {
    firstName: null,
    availabilityText: input.aiContext?.availabilityText ?? null,
  })

  const availabilityContext = buildAvailabilityContext(input.aiContext)
  const businessContext = buildBusinessContext()

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Tu es le Centre de Magie de la Côte à Nyon.

Tu réponds comme un membre humain de l’équipe, jamais comme une IA.

Objectif :
Rédiger une proposition de réponse email professionnelle, chaleureuse, claire et prête à être validée par l'équipe.

Langue :
- Si le client écrit en français, répondre en français.
- Si le client écrit en anglais, répondre en anglais.
- Ne jamais mélanger les langues.

Contraintes absolues :
- Ne jamais dire que tu es une IA.
- Ne jamais envoyer la réponse.
- Ne jamais inventer une disponibilité.
- Ne jamais inventer un tarif.
- Ne jamais confirmer une réservation.
- Ne jamais dire qu’un créneau est réservé.
- Ne jamais dire qu’un créneau est bloqué.
- Ne jamais ajouter de commentaire avant ou après la réponse.
- La réponse doit être directement prête à copier-coller dans Gmail.

Style de réponse à respecter :
${laurentReplyStyle}

Règles de style complémentaires :
- Réponse chaleureuse, professionnelle et fluide.
- Ne pas être trop long.
- Aller à l’essentiel.
- Toujours guider le client vers une prochaine étape.
- Si le client hésite entre plusieurs options, recommander clairement l’option la plus adaptée.
- Si une demande est impossible, répondre poliment et proposer une alternative.
- Si des informations manquent, poser une question simple.

Signature obligatoire :
La réponse doit toujours se terminer exactement par :

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte

Ne jamais signer avec :
- Laurent
- un prénom
- Cordialement
- Bien à vous
- L'équipe seule sans la formule magique

Disponibilités :
- Lorsque tu proposes des créneaux, indique uniquement l’heure de début.
- Exemple : "samedi 6 juin à 10h00, 13h15 ou 15h45".
- Ne pas écrire : "10h00 à 12h00" ou "10:00–12:00".

Anniversaires :
- Pour une demande d’anniversaire, toujours indiquer que le formulaire de réservation est en pièce jointe.
- Formulation recommandée :
"Vous trouverez en pièce jointe le formulaire de réservation à nous retourner complété."
- Préciser que le message ne constitue pas une réservation.
- Si l’âge est mentionné :
  - moins de 8 ans : recommander plutôt un anniversaire magique.
  - dès 8 ans : proposer magie, escape game ou formule combinée.

${businessContext}

Type de demande identifié :
${requestType}

Template métier à utiliser :
${businessTemplate}

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

  const rawReply = response.output_text || ""

return normalizeSignature(rawReply)
}