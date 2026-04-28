import { prisma } from '../lib/prisma'
import type { IncomingEmail } from './message.service'
import { analyzeTaskNeed } from './task-intelligence.service'
import { generateAIReply } from './ai-reply-generator.service'

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

  const existingTask = await tx.task.findFirst({
    where: {
      customerId,
      title: decision.title,
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

  const suggestedReply = await generateAIReply({
  fromEmail: email.fromEmail,
  subject: email.subject,
  body: email.body,
  decision,
})
  const task = await tx.task.create({
    data: {
      customerId,
      taskType: decision.taskType,
      title: decision.title,
      description: `
${decision.description}

--- RÉPONSE SUGGÉRÉE ---

${suggestedReply}
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