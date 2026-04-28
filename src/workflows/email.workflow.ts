import { prisma } from '../lib/prisma'
import { findOrCreateCustomer } from '../services/customer.service'
import { createInboundMessage } from '../services/message.service'
import type { IncomingEmail } from '../services/message.service'
import { createSmartTaskIfNeeded } from '../services/task.service'
import {
  createMessageReceivedEvent,
  createTaskCreatedEvent,
  markEventAsProcessed,
} from '../services/event.service'

export async function processIncomingEmail(email: IncomingEmail) {
  return prisma.$transaction(
    async (tx) => {
      const { customer, action: customerAction } = await findOrCreateCustomer(
        email.fromEmail,
        tx
      )

      const message = await createInboundMessage(customer.id, email, tx)

      const messageEvent = await createMessageReceivedEvent(
        message.id,
        customer.id,
        email.fromEmail,
        email.subject,
        tx
      )

      const { task, action: taskAction, decision } =
        await createSmartTaskIfNeeded(customer.id, email, tx)

      let taskEvent = null

      if (task && taskAction === 'CREATED') {
        taskEvent = await createTaskCreatedEvent(
          task.id,
          customer.id,
          task.taskType,
          task.title,
          tx
        )
      }

      await markEventAsProcessed(messageEvent.id, tx)

      if (taskEvent) {
        await markEventAsProcessed(taskEvent.id, tx)
      }

      return {
        customer,
        customerAction,
        message,
        messageEvent,
        task,
        taskAction,
        taskEvent,
        decision,
      }
    },
    {
      timeout: 15000,
    }
  )
}