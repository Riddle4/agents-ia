import { prisma } from '../lib/prisma'
import type { IncomingEmail } from './message.service'
import type { EmailAnalysis } from './email-analysis.service'
import { analyzeTaskNeed } from './task-intelligence.service'
import { generateAIReply } from './ai-reply-generator.service'
import type { SmartTaskDecision } from './task-intelligence.service'

function formatEmailAnalysis(email: IncomingEmail) {
  const analysis = email.aiContext?.emailAnalysis

  if (!analysis) {
    return 'Analyse structurée indisponible.'
  }

  const missingCustomerInfo = analysis.missingCustomerInfo.length
    ? analysis.missingCustomerInfo.map((info) => `- ${info}`).join('\n')
    : '- Aucune'

  const missingHumanInfo = analysis.missingHumanInfo.length
    ? analysis.missingHumanInfo.map((info) => `- ${info}`).join('\n')
    : '- Aucune'

  return `
Type de demande : ${analysis.requestType}
Lieu : ${analysis.locationType ?? 'non déterminé'}
Mode de réponse : ${analysis.replyMode}
Calendrier vérifié : ${analysis.shouldCheckCalendar ? 'oui' : 'non'}
Confiance : ${analysis.confidence}

Résumé :
${analysis.reasoningSummary}

Informations client manquantes :
${missingCustomerInfo}

Informations internes manquantes :
${missingHumanInfo}

Question interne :
${analysis.humanQuestion ?? 'Aucune'}
`.trim()
}

function requiresHumanInfo(email: IncomingEmail) {
  const analysis = email.aiContext?.emailAnalysis

  return Boolean(
    analysis &&
      (analysis.replyMode === 'ESCALATE_TO_HUMAN' ||
        analysis.missingHumanInfo.length > 0 ||
        analysis.humanQuestion)
  )
}

function buildHumanInfoRequest(email: IncomingEmail) {
  const analysis = email.aiContext?.emailAnalysis

  if (!analysis) {
    return 'Merci de compléter les informations internes nécessaires avant de préparer la réponse client.'
  }

  const missingHumanInfo = analysis.missingHumanInfo.length
    ? analysis.missingHumanInfo.map((info) => `- ${info}`).join('\n')
    : '- Information interne à préciser'

  return `
Le client attend une réponse, mais l'IA n'a pas assez d'informations internes pour rédiger un email fiable.

Merci de compléter les points suivants :
${missingHumanInfo}

Question pour l'opérateur :
${analysis.humanQuestion ?? 'Quelles informations devons-nous utiliser pour répondre précisément au client ?'}

Après ajout de ces informations, générer ou rédiger une réponse client complète. Ne pas répondre au client avec une formule vague du type "nous allons nous renseigner".
`.trim()
}

function extractSection(description: string, startMarker: string, endMarkers: string[]) {
  if (!description.includes(startMarker)) {
    return ''
  }

  let value = description.split(startMarker)[1]

  for (const marker of endMarkers) {
    if (value.includes(marker)) {
      value = value.split(marker)[0]
    }
  }

  return value.trim()
}

function replaceOrAppendSection(description: string, marker: string, content: string) {
  const allMarkers = [
    '--- RÉSUMÉ IA ---',
    '--- ANALYSE STRUCTURÉE ---',
    '--- INFORMATION INTERNE REQUISE ---',
    '--- INFORMATION FOURNIE PAR L’ÉQUIPE ---',
    '--- MESSAGE CLIENT ---',
    '--- RÉPONSE SUGGÉRÉE ---',
    '--- RÉPONSE À GÉNÉRER APRÈS COMPLÉTION INTERNE ---',
  ]

  const nextMarkers = allMarkers.filter((item) => item !== marker)

  if (!description.includes(marker)) {
    return `${description.trim()}

${marker}

${content.trim()}`.trim()
  }

  const before = description.split(marker)[0].trimEnd()
  const afterMarker = description.split(marker)[1]
  let after = ''

  for (const nextMarker of nextMarkers) {
    const index = afterMarker.indexOf(nextMarker)

    if (index !== -1) {
      after = afterMarker.slice(index).trimStart()
      break
    }
  }

  return `${before}

${marker}

${content.trim()}

${after}`.trim()
}

function parseMessageFromDescription(description: string) {
  const message = extractSection(description, '--- MESSAGE CLIENT ---', [
    '--- RÉPONSE SUGGÉRÉE ---',
    '--- RÉPONSE À GÉNÉRER APRÈS COMPLÉTION INTERNE ---',
  ])

  const lines = message.split('\n')
  const fromLine = lines.find((line) => line.startsWith('De : '))
  const subjectLine = lines.find((line) => line.startsWith('Sujet : '))
  const bodyStartIndex = lines.findIndex((line, index) => {
    return index > 0 && line.trim() === '' && lines[index - 1]?.startsWith('Sujet : ')
  })

  return {
    fromEmail: fromLine?.replace('De : ', '').trim() || 'unknown@example.com',
    subject: subjectLine?.replace('Sujet : ', '').trim() || '(Sans sujet)',
    body:
      bodyStartIndex !== -1
        ? lines.slice(bodyStartIndex + 1).join('\n').trim()
        : message.trim(),
  }
}

function buildDecisionFromTask(task: {
  taskType: string
  title: string
  description: string | null
  priority: string
  dueAt: Date | null
}): SmartTaskDecision {
  return {
    shouldCreateTask: true,
    taskType: task.taskType,
    title: task.title.replace(/^Compléter les informations internes - /, ''),
    description: task.description || '',
    priority: task.priority === 'HIGH' || task.priority === 'LOW' ? task.priority : 'MEDIUM',
    dueAt: task.dueAt,
  }
}

function buildResolvedAnalysis(): EmailAnalysis {
  return {
    requestType: 'QUESTION_SIMPLE',
    locationType: 'UNKNOWN',
    shouldCheckCalendar: false,
    replyMode: 'ANSWER_AND_CLOSE',
    missingCustomerInfo: [],
    missingHumanInfo: [],
    humanQuestion: null,
    confidence: 1,
    reasoningSummary:
      "Les informations internes ont été complétées par l'équipe et peuvent être utilisées pour rédiger la réponse client.",
  }
}

export async function createFollowUpTaskIfNeeded(
  customerId: string,
  email: IncomingEmail,
  tx = prisma
) {
  return createSmartTaskIfNeeded(customerId, email, tx)
}

export async function createSmartTaskIfNeeded(
  customerId: string,
  email: IncomingEmail,
  tx: any = prisma
) {
  const decision = analyzeTaskNeed({
    subject: email.subject,
    body: email.body,
    fromEmail: email.fromEmail,
  })

  if (!decision.shouldCreateTask) {
    return {
      task: null,
      action: 'SKIPPED',
      decision,
    }
  }

  const needsHumanInfo = requiresHumanInfo(email)
  const taskTitle = needsHumanInfo
    ? `Compléter les informations internes - ${decision.title}`
    : decision.title

  const existingTask = await tx.task.findFirst({
    where: {
      customerId,
      title: taskTitle,
      status: 'TODO',
    },
  })

  if (existingTask) {
    return {
      task: existingTask,
      action: 'ALREADY_EXISTS',
      decision,
    }
  }

  const suggestedReply = needsHumanInfo
    ? null
    : await generateAIReply({
        fromEmail: email.fromEmail,
        subject: email.subject,
        body: email.body,
        decision,
        aiContext: email.aiContext,
      })

  const humanInfoRequest = needsHumanInfo ? buildHumanInfoRequest(email) : null

const task = await tx.task.create({
  data: {
    customerId,
    taskType: decision.taskType,
    title: taskTitle,
    description: `
--- RÉSUMÉ IA ---

${decision.description}

--- ANALYSE STRUCTURÉE ---

${formatEmailAnalysis(email)}

${humanInfoRequest ? `--- INFORMATION INTERNE REQUISE ---

${humanInfoRequest}

` : ''}--- MESSAGE CLIENT ---

De : ${email.fromEmail}
Sujet : ${email.subject}

${email.body}

${suggestedReply ? `--- RÉPONSE SUGGÉRÉE ---

${suggestedReply}` : '--- RÉPONSE À GÉNÉRER APRÈS COMPLÉTION INTERNE ---'}
`.trim(),
    status: 'TODO',
    priority: decision.priority,
    dueAt: decision.dueAt,
  },
})

 return {
    task,
    action: 'CREATED',
    decision,
  }
}

export async function generateReplyForTaskWithHumanInfo(
  taskId: string,
  humanProvidedInfo: string
) {
  const cleanedHumanInfo = humanProvidedInfo.trim()

  if (!cleanedHumanInfo) {
    throw new Error('Informations internes manquantes')
  }

  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
  })

  if (!task || !task.description) {
    throw new Error('Tâche introuvable ou description manquante')
  }

  const parsedMessage = parseMessageFromDescription(task.description)
  const decision = buildDecisionFromTask(task)

  const suggestedReply = await generateAIReply({
    fromEmail: parsedMessage.fromEmail,
    subject: parsedMessage.subject,
    body: parsedMessage.body,
    decision,
    aiContext: {
      needsAvailability: false,
      humanProvidedInfo: cleanedHumanInfo,
      emailAnalysis: buildResolvedAnalysis(),
    },
  })

  let description = replaceOrAppendSection(
    task.description,
    '--- INFORMATION FOURNIE PAR L’ÉQUIPE ---',
    cleanedHumanInfo
  )

  if (description.includes('--- RÉPONSE À GÉNÉRER APRÈS COMPLÉTION INTERNE ---')) {
    description = description.replace(
      '--- RÉPONSE À GÉNÉRER APRÈS COMPLÉTION INTERNE ---',
      `--- RÉPONSE SUGGÉRÉE ---

${suggestedReply}`
    )
  } else {
    description = replaceOrAppendSection(
      description,
      '--- RÉPONSE SUGGÉRÉE ---',
      suggestedReply
    )
  }

  return prisma.task.update({
    where: {
      id: taskId,
    },
    data: {
      description,
      title: task.title.replace(/^Compléter les informations internes - /, ''),
    },
  })
}
