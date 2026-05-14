import OpenAI from "openai"
import type { SmartTaskDecision } from "./task-intelligence.service"
import type { EmailAnalysis, EmailRequestType, ReplyMode } from "./email-analysis.service"
import { laurentReplyStyle } from "../config/laurent-style"
import { classifyRequest, type RequestType } from "./request-classifier.service"
import { getBusinessTemplate } from "./reply-templates.service"

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
  availabilityError?: string | null
  humanProvidedInfo?: string | null
  emailAnalysis?: EmailAnalysis
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
    .replace(/^Centre de Magie de la Côte\s*$/gim, "")
    .replace(/^Cordialement,?\s*$/gim, "")
    .replace(/^Bien à vous,?\s*$/gim, "")
    .replace(/^Belle journée,?\s*$/gim, "")
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

  if (aiContext.availabilityError) {
    return `
Disponibilités :
La vérification du calendrier n'a pas pu être effectuée.

Erreur interne :
${aiContext.availabilityError}

Instruction :
- Ne propose aucun créneau.
- Explique simplement que nous allons vérifier les disponibilités et revenir vers le client.
- Ne laisse pas entendre que le calendrier a été consulté.
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
- Si le mode de réponse demande une suite client, demande quel créneau conviendrait le mieux.
`.trim()
}

function mapAnalysisRequestType(type?: EmailRequestType): RequestType | null {
  if (!type || type === "CONFIRMATION_OR_THANKS") {
    return null
  }

  const allowed: RequestType[] = [
    "ANNIVERSAIRE",
    "COURS_COLLECTIF",
    "STAGE",
    "ESCAPE_GAME",
    "BOUTIQUE",
    "ECOLE_PRIVEE",
    "ANIMATION_EXTERNE",
    "TEAM_BUILDING",
    "SOIREE_MAGIQUE_PRIVEE",
    "ANIMATION_DOMICILE_SIMPLE",
    "QUESTION_SIMPLE",
    "UNKNOWN",
  ]

  return allowed.includes(type as RequestType) ? (type as RequestType) : null
}

function buildReplyModeContext(replyMode?: ReplyMode) {
  switch (replyMode) {
    case "ANSWER_AND_CLOSE":
      return `
Mode de réponse : ANSWER_AND_CLOSE
- Réponds clairement au message.
- Termine naturellement, sans poser de question au client.
- N'ajoute pas de formule du type "n'hésitez pas..." si elle ouvre artificiellement une suite.
- Utilise ce mode notamment pour une confirmation, un remerciement, une information suffisante ou un message qui ne nécessite pas d'action client.
`.trim()

    case "ANSWER_AND_ASK":
      return `
Mode de réponse : ANSWER_AND_ASK
- Réponds d'abord à ce qui peut être répondu.
- Pose au maximum une question utile au client à la fin.
- La question doit être directement nécessaire pour avancer.
`.trim()

    case "ASK_MISSING_INFO":
      return `
Mode de réponse : ASK_MISSING_INFO
- Une information indispensable manque côté client.
- Explique brièvement ce qui est possible.
- Pose uniquement les questions strictement nécessaires.
- Regroupe les questions en une formulation courte.
`.trim()

    case "ESCALATE_TO_HUMAN":
      return `
Mode de réponse : ESCALATE_TO_HUMAN
- Il manque une information interne à l'équipe.
- Ne pose pas au client une question destinée à l'équipe.
- Ne donne pas de tarif, disponibilité, promesse ou décision non fournie.
- Ne rédige pas une réponse client vague indiquant que nous allons vérifier le point.
- La tâche doit être complétée par un humain avant préparation de la réponse finale.
`.trim()

    default:
      return `
Mode de réponse : non précisé
- Réponds de manière naturelle.
- Ne termine par une question que si elle est vraiment utile.
`.trim()
  }
}

function buildHumanAssistanceContext(analysis?: EmailAnalysis) {
  if (!analysis?.missingHumanInfo.length && !analysis?.humanQuestion) {
    return `
Assistance humaine interne :
Non requise.
`.trim()
  }

  return `
Assistance humaine interne requise :
${analysis.missingHumanInfo.map((info) => `- ${info}`).join("\n")}

Question pour la personne qui valide :
${analysis.humanQuestion ?? "Information interne à compléter avant validation."}

Instruction :
- N'invente pas cette information dans la réponse client.
- Ne transforme pas cette question interne en question au client.
`.trim()
}

function buildHumanProvidedInfoContext(aiContext?: AIContext) {
  if (!aiContext?.humanProvidedInfo?.trim()) {
    return `
Informations fournies par l'équipe :
Aucune information complémentaire fournie.
`.trim()
  }

  return `
Informations fournies par l'équipe :
${aiContext.humanProvidedInfo.trim()}

Instruction :
- Utilise ces informations comme source fiable pour rédiger la réponse client.
- Tu peux maintenant répondre précisément au client.
- Ne mentionne pas que l'équipe a dû compléter ces informations en interne.
`.trim()
}

function buildCustomerMissingInfoContext(analysis?: EmailAnalysis) {
  if (!analysis?.missingCustomerInfo.length) {
    return `
Informations client manquantes :
Aucune information client indispensable détectée.
`.trim()
  }

  return `
Informations client manquantes :
${analysis.missingCustomerInfo.map((info) => `- ${info}`).join("\n")}
`.trim()
}

function buildBusinessContext() {
  return `
Le Centre de Magie de la Côte est situé à Nyon.

Services proposés :
- Anniversaires pour enfants
- Cours de magie collectifs enfants à Genève, Nyon, Morges et Martigny, dès 7 ans
- Stages de magie : Pâques, vacances d'été, vacances d'automne / Halloween, pour enfants dès 6 ans
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
- Pour une demande de stage, ne jamais indiquer un âge minimum de 7 ans : les stages acceptent les enfants dès 6 ans.
- Pour une animation externe, demander les précisions nécessaires avant de proposer une offre.
`.trim()
}

export async function generateAIReply(input: GenerateAIReplyInput) {
  const client = getOpenAIClient()

  if (!client) {
    throw new Error("OPENAI_API_KEY manquante dans .env")
  }

  const analysis = input.aiContext?.emailAnalysis
  const requestType =
    mapAnalysisRequestType(analysis?.requestType) ??
    classifyRequest(input.subject, input.body)

  const businessTemplate = getBusinessTemplate(requestType, {
    firstName: null,
    availabilityText: input.aiContext?.availabilityText ?? null,
  })

  const availabilityContext = buildAvailabilityContext(input.aiContext)
  const businessContext = buildBusinessContext()
  const replyModeContext = buildReplyModeContext(analysis?.replyMode)
  const humanAssistanceContext = buildHumanAssistanceContext(analysis)
  const customerMissingInfoContext = buildCustomerMissingInfoContext(analysis)
  const humanProvidedInfoContext = buildHumanProvidedInfoContext(input.aiContext)

  const response = await client.responses.create({
    model: process.env.ECHO_REPLY_MODEL || "gpt-5",
    input: `
Tu es le Centre de Magie de la Côte à Nyon.

Tu réponds comme un membre humain de l’équipe, jamais comme une IA.

Objectif :
Rédiger une proposition de réponse email chaleureuse, naturelle, claire et prête à être validée par l'équipe.
Le client doit sentir qu’une vraie personne du Centre de Magie lui répond.

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
- Ne jamais masquer une information interne manquante par une réponse vague du type "nous allons vérifier" ou "nous reviendrons vers vous".
- Ne jamais ajouter de commentaire avant ou après la réponse.
- La réponse doit être directement prête à copier-coller dans Gmail.

Style de réponse à respecter :
${laurentReplyStyle}

Règles de style complémentaires :
- Réponse chaleureuse, naturelle et fluide.
- Écris comme une personne aimable, pas comme un service administratif.
- Privilégie les formulations simples : "Merci beaucoup pour votre message", "Avec plaisir", "Nous serions ravis..." selon le contexte.
- Évite les tournures froides ou trop institutionnelles : "Nous avons bien reçu votre demande", "Nous ne manquerons pas de revenir vers vous", "Nous restons à votre entière disposition".
- Garde un peu de sourire dans le texte, sans devenir familier ni trop marketing.
- Varie les débuts de phrases : n’enchaîne pas plusieurs phrases qui commencent par "Nous".
- Ne pas être trop long.
- Aller à l’essentiel.
- Guider le client vers une prochaine étape seulement si une prochaine étape est nécessaire.
- Ne termine jamais par une question de confort ou une question automatique.
- Si le mode est ANSWER_AND_CLOSE, conclus sans question.
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
- Belle journée
- Centre de Magie de la Côte seul
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

Analyse structurée :
Type : ${analysis?.requestType ?? "non disponible"}
Lieu : ${analysis?.locationType ?? "non déterminé"}
Vérification calendrier autorisée : ${analysis?.shouldCheckCalendar ? "oui" : "non"}
Confiance : ${analysis?.confidence ?? "non disponible"}
Résumé interne : ${analysis?.reasoningSummary ?? "non disponible"}

${replyModeContext}

${customerMissingInfoContext}

${humanAssistanceContext}

${humanProvidedInfoContext}

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
