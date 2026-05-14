import OpenAI from "openai"

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

export type EmailRequestType =
  | "ANNIVERSAIRE"
  | "COURS_COLLECTIF"
  | "STAGE"
  | "ESCAPE_GAME"
  | "BOUTIQUE"
  | "ECOLE_PRIVEE"
  | "ANIMATION_EXTERNE"
  | "TEAM_BUILDING"
  | "SOIREE_MAGIQUE_PRIVEE"
  | "ANIMATION_DOMICILE_SIMPLE"
  | "QUESTION_SIMPLE"
  | "CONFIRMATION_OR_THANKS"
  | "UNKNOWN"

export type EmailLocationType =
  | "CENTRE_MAGIE_NYON"
  | "CLIENT_LOCATION"
  | "SCHOOL_OR_PARTNER"
  | "ONLINE_OR_PHONE"
  | "UNKNOWN"
  | null

export type ReplyMode =
  | "ANSWER_AND_CLOSE"
  | "ANSWER_AND_ASK"
  | "ASK_MISSING_INFO"
  | "ESCALATE_TO_HUMAN"

export type EmailAnalysis = {
  requestType: EmailRequestType
  locationType: EmailLocationType
  shouldCheckCalendar: boolean
  replyMode: ReplyMode
  missingCustomerInfo: string[]
  missingHumanInfo: string[]
  humanQuestion: string | null
  confidence: number
  reasoningSummary: string
}

type AnalyzeEmailInput = {
  subject: string
  body: string
  fromEmail: string
}

const REQUEST_TYPES: EmailRequestType[] = [
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
  "CONFIRMATION_OR_THANKS",
  "UNKNOWN",
]

const LOCATION_TYPES: Exclude<EmailLocationType, null>[] = [
  "CENTRE_MAGIE_NYON",
  "CLIENT_LOCATION",
  "SCHOOL_OR_PARTNER",
  "ONLINE_OR_PHONE",
  "UNKNOWN",
]

const REPLY_MODES: ReplyMode[] = [
  "ANSWER_AND_CLOSE",
  "ANSWER_AND_ASK",
  "ASK_MISSING_INFO",
  "ESCALATE_TO_HUMAN",
]

function parseJSON(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)

    if (!match) {
      return null
    }

    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === "string")
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5
  }

  return Math.min(1, Math.max(0, value))
}

function normalizeAnalysis(raw: any, fallback: EmailAnalysis): EmailAnalysis {
  const requestType = REQUEST_TYPES.includes(raw?.requestType)
    ? raw.requestType
    : fallback.requestType

  const rawLocation = raw?.locationType
  const locationType =
    rawLocation === null || rawLocation === undefined
      ? fallback.locationType
      : LOCATION_TYPES.includes(rawLocation)
        ? rawLocation
        : fallback.locationType

  const missingHumanInfo = toStringArray(raw?.missingHumanInfo)
  const humanQuestion =
    typeof raw?.humanQuestion === "string" && raw.humanQuestion.trim()
      ? raw.humanQuestion.trim()
      : null

  const replyMode =
    missingHumanInfo.length > 0 || humanQuestion
      ? "ESCALATE_TO_HUMAN"
      : REPLY_MODES.includes(raw?.replyMode)
        ? raw.replyMode
        : fallback.replyMode

  const shouldCheckCalendar =
    requestType === "ANNIVERSAIRE" &&
    locationType === "CENTRE_MAGIE_NYON" &&
    raw?.shouldCheckCalendar === true

  return {
    requestType,
    locationType,
    shouldCheckCalendar,
    replyMode,
    missingCustomerInfo: toStringArray(raw?.missingCustomerInfo),
    missingHumanInfo,
    humanQuestion,
    confidence: clampConfidence(raw?.confidence),
    reasoningSummary:
      typeof raw?.reasoningSummary === "string" && raw.reasoningSummary.trim()
        ? raw.reasoningSummary.trim()
        : fallback.reasoningSummary,
  }
}

function heuristicAnalysis(input: AnalyzeEmailInput): EmailAnalysis {
  const text = `${input.subject} ${input.body}`.toLowerCase()

  const isThanksOnly =
    /\bmerci\b/.test(text) &&
    !/(anniversaire|devis|prix|tarif|disponib|réserv|reservation|inscription|stage|cours|escape|animation)/.test(text)

  if (isThanksOnly) {
    return {
      requestType: "CONFIRMATION_OR_THANKS",
      locationType: null,
      shouldCheckCalendar: false,
      replyMode: "ANSWER_AND_CLOSE",
      missingCustomerInfo: [],
      missingHumanInfo: [],
      humanQuestion: null,
      confidence: 0.7,
      reasoningSummary: "Message de remerciement ou de confirmation ne nécessitant pas de prochaine question.",
    }
  }

  const isBirthday = text.includes("anniversaire") || text.includes("birthday")
  const isAtCenter =
    text.includes("chez vous") ||
    text.includes("dans vos locaux") ||
    text.includes("au centre") ||
    text.includes("centre de magie") ||
    text.includes("à nyon") ||
    text.includes("a nyon")
  const isAtClientLocation =
    text.includes("domicile") ||
    text.includes("chez nous") ||
    text.includes("chez moi") ||
    text.includes("notre école") ||
    text.includes("notre ecole") ||
    text.includes("notre entreprise")
  const asksAvailability =
    text.includes("disponib") ||
    text.includes("créneau") ||
    text.includes("creneau") ||
    text.includes("date") ||
    text.includes("réserv") ||
    text.includes("reservation")

  const isSchoolWorkshop =
    text.includes("sortie scolaire") ||
    text.includes("élèves") ||
    text.includes("eleves") ||
    text.includes("classe") ||
    text.includes("école") ||
    text.includes("ecole") ||
    text.includes("atelier") ||
    text.includes("ateliers")

  if (isSchoolWorkshop && (text.includes("prix") || text.includes("tarif") || text.includes("consist"))) {
    return {
      requestType: "ECOLE_PRIVEE",
      locationType: "SCHOOL_OR_PARTNER",
      shouldCheckCalendar: false,
      replyMode: "ESCALATE_TO_HUMAN",
      missingCustomerInfo: [],
      missingHumanInfo: [
        "Description précise des ateliers de magie pour sortie scolaire",
        "Âges recommandés ou adaptation pour des élèves de 13-14 ans",
        "Durée proposée pour le groupe",
        "Tarif applicable pour le nombre d'élèves indiqué",
        "Faisabilité ou disponibilité de la date demandée si nécessaire",
      ],
      humanQuestion:
        "Quelles informations devons-nous utiliser pour répondre à cette demande de sortie scolaire ?",
      confidence: 0.75,
      reasoningSummary:
        "Demande de sortie scolaire ou atelier pour élèves nécessitant des informations internes avant réponse client.",
    }
  }

  if (isBirthday) {
    return {
      requestType: "ANNIVERSAIRE",
      locationType: isAtClientLocation
        ? "CLIENT_LOCATION"
        : isAtCenter || asksAvailability
          ? "CENTRE_MAGIE_NYON"
          : "UNKNOWN",
      shouldCheckCalendar: !isAtClientLocation && asksAvailability,
      replyMode: asksAvailability ? "ANSWER_AND_ASK" : "ASK_MISSING_INFO",
      missingCustomerInfo: [],
      missingHumanInfo: [],
      humanQuestion: null,
      confidence: 0.65,
      reasoningSummary: "Demande d'anniversaire détectée par mots-clés.",
    }
  }

  if (
    text.includes("stage") ||
    text.includes("camp") ||
    text.includes("vacances") ||
    text.includes("pâques") ||
    text.includes("été") ||
    text.includes("automne") ||
    text.includes("halloween")
  ) {
    return {
      requestType: "STAGE",
      locationType: "CENTRE_MAGIE_NYON",
      shouldCheckCalendar: false,
      replyMode: "ANSWER_AND_CLOSE",
      missingCustomerInfo: [],
      missingHumanInfo: [],
      humanQuestion: null,
      confidence: 0.65,
      reasoningSummary: "Demande liée aux stages détectée par mots-clés. Le calendrier anniversaire ne doit pas être consulté.",
    }
  }

  if (
    text.includes("cours de magie") ||
    text.includes("cours collectif") ||
    text.includes("année scolaire") ||
    text.includes("inscription")
  ) {
    return {
      requestType: "COURS_COLLECTIF",
      locationType: "UNKNOWN",
      shouldCheckCalendar: false,
      replyMode: "ANSWER_AND_CLOSE",
      missingCustomerInfo: [],
      missingHumanInfo: [],
      humanQuestion: null,
      confidence: 0.6,
      reasoningSummary: "Demande liée aux cours ou inscriptions détectée par mots-clés.",
    }
  }

  if (text.includes("tarif") || text.includes("prix") || text.includes("devis")) {
    return {
      requestType: text.includes("domicile") ? "ANIMATION_DOMICILE_SIMPLE" : "ANIMATION_EXTERNE",
      locationType: text.includes("domicile") ? "CLIENT_LOCATION" : "UNKNOWN",
      shouldCheckCalendar: false,
      replyMode: text.includes("domicile") ? "ANSWER_AND_CLOSE" : "ESCALATE_TO_HUMAN",
      missingCustomerInfo: [],
      missingHumanInfo: text.includes("domicile") ? [] : ["Tarif ou cadrage commercial à confirmer"],
      humanQuestion: text.includes("domicile")
        ? null
        : "Quel tarif ou quelle orientation commerciale faut-il appliquer à cette demande ?",
      confidence: 0.6,
      reasoningSummary: "Demande commerciale détectée par mots-clés.",
    }
  }

  return {
    requestType: "UNKNOWN",
    locationType: null,
    shouldCheckCalendar: false,
    replyMode: "ANSWER_AND_CLOSE",
    missingCustomerInfo: [],
    missingHumanInfo: [],
    humanQuestion: null,
    confidence: 0.45,
    reasoningSummary: "Analyse heuristique par défaut.",
  }
}

export async function analyzeEmail(input: AnalyzeEmailInput): Promise<EmailAnalysis> {
  const fallback = heuristicAnalysis(input)

  const client = getOpenAIClient()

  if (!client) {
    return fallback
  }

  const response = await client.responses.create({
    model: process.env.ECHO_ANALYSIS_MODEL || "gpt-5",
    input: `
Tu analyses un email client pour le Centre de Magie de la Côte à Nyon.

Retourne uniquement un JSON STRICT, sans markdown, avec cette forme exacte :
{
  "requestType": "ANNIVERSAIRE | COURS_COLLECTIF | STAGE | ESCAPE_GAME | BOUTIQUE | ECOLE_PRIVEE | ANIMATION_EXTERNE | TEAM_BUILDING | SOIREE_MAGIQUE_PRIVEE | ANIMATION_DOMICILE_SIMPLE | QUESTION_SIMPLE | CONFIRMATION_OR_THANKS | UNKNOWN",
  "locationType": "CENTRE_MAGIE_NYON | CLIENT_LOCATION | SCHOOL_OR_PARTNER | ONLINE_OR_PHONE | UNKNOWN | null",
  "shouldCheckCalendar": true,
  "replyMode": "ANSWER_AND_CLOSE | ANSWER_AND_ASK | ASK_MISSING_INFO | ESCALATE_TO_HUMAN",
  "missingCustomerInfo": [],
  "missingHumanInfo": [],
  "humanQuestion": null,
  "confidence": 0.0,
  "reasoningSummary": "résumé interne court"
}

Règle calendrier absolue :
- shouldCheckCalendar vaut true uniquement si la demande concerne un ANNIVERSAIRE dans les locaux du Centre de Magie de la Côte à Nyon ET que le client demande une date, une disponibilité, une réservation ou un créneau.
- shouldCheckCalendar vaut false pour les stages, cours, écoles, escape games hors anniversaire, boutique, animations externes, magicien à domicile, team building, demandes de tarifs simples, confirmations, remerciements.

Règles replyMode :
- ANSWER_AND_CLOSE : répondre puis conclure sans question si aucune suite client n'est nécessaire.
- ANSWER_AND_ASK : répondre puis poser une question utile au client.
- ASK_MISSING_INFO : une information client indispensable manque.
- ESCALATE_TO_HUMAN : l'IA ne peut pas répondre sans information interne, tarif non connu, cas particulier ou décision commerciale.

Règles d'escalade humaine :
- Ne mets pas dans missingHumanInfo une information que le client peut donner lui-même.
- Utilise missingHumanInfo pour les informations internes : tarif à confirmer, décision commerciale, cas sensible, règle métier absente, disponibilité ambiguë.
- Si missingHumanInfo n'est pas vide, humanQuestion doit être une question claire destinée à la personne qui valide l'email.
- Pars du principe que l'équipe possède les réponses aux questions métier. Si l'information n'est pas dans le contexte IA, utilise ESCALATE_TO_HUMAN au lieu de préparer une réponse vague au client.
- Pour une sortie scolaire, un atelier scolaire, une classe ou un groupe d'élèves qui demande description, âge recommandé, prix, durée ou faisabilité, utilise ESCALATE_TO_HUMAN sauf si toutes ces informations sont explicitement disponibles dans le contexte.
- N'utilise pas ANSWER_AND_CLOSE avec une phrase du type "nous allons vérifier" quand il manque une information interne.

Email :
De : ${input.fromEmail}
Sujet : ${input.subject}

Message :
${input.body}
    `.trim(),
  })

  const parsed = parseJSON(response.output_text || "")

  if (!parsed) {
    return fallback
  }

  return normalizeAnalysis(parsed, fallback)
}
