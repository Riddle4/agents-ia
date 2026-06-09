import OpenAI from "openai"
import { prisma } from "../lib/prisma"
import { listUpcomingCalendarEvents } from "./calendar.service"
import { listKnowledgeBaseEntries } from "./knowledge-base.service"

type CopilotRole = "user" | "assistant"

export type CopilotMessage = {
  role: CopilotRole
  content: string
}

type CopilotInput = {
  message: string
  history?: CopilotMessage[]
}

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

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-"

  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(value))
}

function truncate(text: string | null | undefined, maxLength = 900) {
  const value = String(text || "").replace(/\s+/g, " ").trim()

  if (value.length <= maxLength) {
    return value || "-"
  }

  return `${value.slice(0, maxLength - 1).trim()}…`
}

async function safeLoadCalendarEvents() {
  try {
    return {
      events: await listUpcomingCalendarEvents(12),
      error: null,
    }
  } catch (error) {
    return {
      events: [],
      error: error instanceof Error ? error.message : "Google Calendar inaccessible",
    }
  }
}

async function loadCopilotContext() {
  const [tasks, messages, marketAlerts, knowledgeEntries, calendar] = await Promise.all([
    prisma.task.findMany({
      where: { status: "TODO" },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 12,
      include: { customer: true },
    }),
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { customer: true },
    }),
    prisma.marketAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    listKnowledgeBaseEntries(12),
    safeLoadCalendarEvents(),
  ])

  const openTasks = tasks
    .map((task, index) => {
      const customer = [task.customer?.firstName, task.customer?.lastName].filter(Boolean).join(" ")
      return `
Tâche ${index + 1}
- Priorité : ${task.priority}
- Type : ${task.taskType}
- Titre : ${task.title}
- Client : ${customer || task.customer?.email || "non renseigné"}
- Créée : ${formatDate(task.createdAt)}
- Description : ${truncate(task.description, 700)}
`.trim()
    })
    .join("\n\n")

  const recentMessages = messages
    .map((message, index) => {
      const customer = [message.customer?.firstName, message.customer?.lastName].filter(Boolean).join(" ")
      return `
Message ${index + 1}
- Reçu : ${formatDate(message.createdAt)}
- De/Client : ${customer || message.customer?.email || "non renseigné"}
- Compte source : ${message.sourceAccount || message.source}
- Sens : ${message.direction}
- Sujet : ${message.subject}
- Type : ${message.messageType}
- Priorité : ${message.priority}
- Extrait : ${truncate(message.body, 700)}
`.trim()
    })
    .join("\n\n")

  const alerts = marketAlerts
    .map((alert, index) => {
      return `
Alerte ${index + 1}
- Date : ${formatDate(alert.createdAt)}
- Domaine : ${alert.domain}
- Type : ${alert.type}
- Concurrent : ${alert.competitor || "-"}
- Message : ${alert.message}
`.trim()
    })
    .join("\n\n")

  const knowledge = knowledgeEntries
    .map((entry, index) => {
      return `
Base métier ${index + 1}
- Catégorie : ${entry.category}
- Question : ${entry.question}
- Réponse : ${truncate(entry.answer, 700)}
`.trim()
    })
    .join("\n\n")

  const calendarEvents = calendar.events
    .map((event, index) => {
      return `
Événement ${index + 1}
- Titre : ${event.summary}
- Début : ${formatDate(event.start)}
- Fin : ${formatDate(event.end)}
- Lieu : ${event.location || "-"}
`.trim()
    })
    .join("\n\n")

  return `
Contexte opérationnel Cosmo IA

Tâches ouvertes :
${openTasks || "Aucune tâche TODO visible."}

Messages récents :
${recentMessages || "Aucun message récent visible."}

Prochains événements Google Calendar :
${calendar.error ? `Calendrier inaccessible : ${calendar.error}` : calendarEvents || "Aucun événement à venir visible."}

Alertes marché récentes :
${alerts || "Aucune alerte marché récente."}

Base métier récente :
${knowledge || "Aucune entrée métier disponible."}
`.trim()
}

function sanitizeHistory(history: CopilotMessage[] = []) {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: truncate(message.content, 1600),
    }))
    .slice(-8)
}

export async function answerCosmoCopilot(input: CopilotInput) {
  const question = String(input.message || "").trim()

  if (!question) {
    throw new Error("Message manquant")
  }

  const context = await loadCopilotContext()
  const client = getOpenAIClient()

  if (!client) {
    return `
Je peux déjà consulter les données Cosmo, mais la clé OpenAI n'est pas disponible sur ce serveur.

Résumé local :
${context}
`.trim()
  }

  const history = sanitizeHistory(input.history)

  const response = await client.responses.create({
    model: process.env.COSMO_COPILOT_MODEL || "gpt-5",
    input: [
      {
        role: "developer",
        content: `
Tu es Cosmo Copilot, un assistant interne du Centre de Magie de la Côte.

Tu te comportes comme un collaborateur fiable, synthétique et prudent.
Tu réponds en français, naturellement, avec le ton d'un membre de l'équipe.

Sources :
- Utilise uniquement le contexte Cosmo fourni et la base métier.
- Si une information n'est pas visible dans le contexte, dis-le clairement.
- Ne prétends jamais avoir lu Gmail, WhatsApp ou Calendar en direct si la donnée n'apparaît pas dans le contexte.

Règles d'action :
- Tu peux résumer, prioriser, préparer une réponse email ou proposer une marche à suivre.
- Tu ne peux pas envoyer d'e-mail dans cette version.
- Si l'utilisateur demande d'envoyer, prépare le texte et indique qu'une validation/envoi manuel reste nécessaire.
- Ne confirme jamais une réservation, un tarif ou une disponibilité si ce n'est pas explicitement présent.
- Pour les stages, l'âge minimum est 6 ans.

Réponses :
- Pour "quoi de neuf", donne les points importants : nouveaux messages, tâches urgentes, calendrier, alertes marché.
- Pour une demande de réponse client, propose un brouillon prêt à valider avec la signature officielle si pertinent.
- Reste concis mais utile.
        `.trim(),
      },
      {
        role: "user",
        content: `
Contexte disponible :
${context}

Historique récent de la conversation :
${history.map((message) => `${message.role.toUpperCase()} : ${message.content}`).join("\n\n") || "Aucun."}

Demande actuelle :
${question}
        `.trim(),
      },
    ],
  })

  return (response.output_text || "").trim() || "Je n'ai pas réussi à produire une réponse exploitable."
}
