import { prisma } from '../lib/prisma'

export async function createMessageReceivedEvent(
  messageId: string,
  customerId: string,
  email: string,
  subject: string,
  tx = prisma
) {
  return tx.event.create({
    data: {
      eventType: 'MESSAGE_RECEIVED',
      entityType: 'MESSAGE',
      entityId: messageId,
      payload: {
        customerId,
        email,
        subject,
        source: 'EMAIL',
      },
      status: 'PENDING',
    },
  })
}

export async function createTaskCreatedEvent(
  taskId: string,
  customerId: string,
  taskType: string,
  title: string,
  tx = prisma
) {
  return tx.event.create({
    data: {
      eventType: 'TASK_CREATED',
      entityType: 'TASK',
      entityId: taskId,
      payload: {
        customerId,
        taskType,
        title,
      },
      status: 'PENDING',
    },
  })
}

export async function markEventAsProcessed(eventId: string, tx = prisma) {
  return tx.event.update({
    where: { id: eventId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  })
}