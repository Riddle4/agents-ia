export type SmartTaskDecision = {
  shouldCreateTask: boolean
  taskType: string
  title: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH"
  dueAt: Date | null
}

type AnalyzeTaskInput = {
  subject: string
  body: string
  fromEmail: string
}

export function analyzeTaskNeed(input: AnalyzeTaskInput): SmartTaskDecision {
  const text = `${input.subject} ${input.body}`.toLowerCase()

  if (
    text.includes("anniversaire") ||
    text.includes("birthday")
  ) {
    return {
      shouldCreateTask: true,
      taskType: "BIRTHDAY_REQUEST",
      title: "Répondre à une demande d’anniversaire magique",
      description: `Demande reçue de ${input.fromEmail} concernant un anniversaire magique.`,
      priority: "HIGH",
      dueAt: tomorrow(),
    }
  }

  if (
    text.includes("devis") ||
    text.includes("offre") ||
    text.includes("tarif") ||
    text.includes("prix")
  ) {
    return {
      shouldCreateTask: true,
      taskType: "QUOTE_REQUEST",
      title: "Préparer une réponse commerciale / devis",
      description: `Demande commerciale reçue de ${input.fromEmail}.`,
      priority: "HIGH",
      dueAt: tomorrow(),
    }
  }

  if (
    text.includes("cours") ||
    text.includes("inscription") ||
    text.includes("stage")
  ) {
    return {
      shouldCreateTask: true,
      taskType: "COURSE_REQUEST",
      title: "Répondre à une demande de cours ou stage",
      description: `Demande liée aux cours/stages reçue de ${input.fromEmail}.`,
      priority: "MEDIUM",
      dueAt: inDays(2),
    }
  }

  if (
    text.includes("problème") ||
    text.includes("souci") ||
    text.includes("erreur") ||
    text.includes("remboursement") ||
    text.includes("annulation")
  ) {
    return {
      shouldCreateTask: true,
      taskType: "SUPPORT_REQUEST",
      title: "Traiter une demande support client",
      description: `Demande support reçue de ${input.fromEmail}.`,
      priority: "HIGH",
      dueAt: tomorrow(),
    }
  }

  if (
    text.includes("disponible") ||
    text.includes("disponibilité") ||
    text.includes("date") ||
    text.includes("réserver") ||
    text.includes("reservation") ||
    text.includes("réservation")
  ) {
    return {
      shouldCreateTask: true,
      taskType: "AVAILABILITY_REQUEST",
      title: "Vérifier les disponibilités et répondre au client",
      description: `Demande de disponibilité reçue de ${input.fromEmail}.`,
      priority: "MEDIUM",
      dueAt: inDays(2),
    }
  }

  return {
    shouldCreateTask: false,
    taskType: "GENERAL",
    title: "Message général",
    description: `Message général reçu de ${input.fromEmail}.`,
    priority: "LOW",
    dueAt: null,
  }
}

function tomorrow() {
  return inDays(1)
}

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}