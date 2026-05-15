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
  const { customer, action: customerAction } = await findOrCreateCustomer(
    email.fromEmail
  )

  const { message, action: messageAction } = await createInboundMessage(
    customer.id,
    email
  )

  const messageEvent =
    messageAction === 'CREATED'
      ? await createMessageReceivedEvent(
          message.id,
          customer.id,
          email.fromEmail,
          email.subject
        )
      : null


  const { task, action: taskAction, decision } =
    await createSmartTaskIfNeeded(customer.id, email)

  let taskEvent = null

  if (task && taskAction === 'CREATED') {
    taskEvent = await createTaskCreatedEvent(
      task.id,
      customer.id,
      task.taskType,
      task.title
    )
  }

  if (messageEvent) {
    await markEventAsProcessed(messageEvent.id)
  }

  if (taskEvent) {
    await markEventAsProcessed(taskEvent.id)
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
}
