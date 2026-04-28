import { processIncomingEmail } from '../workflows/email.workflow'
import type { IncomingEmail } from '../services/message.service'

export async function runEmailAgent(email: IncomingEmail) {
  console.log('\n🤖 EmailAgent démarré')
  console.log(`Email reçu de : ${email.fromEmail}`)
  console.log(`Sujet : ${email.subject}`)

  const result = await processIncomingEmail(email)

  console.log('\n✅ EmailAgent terminé')
  console.log(`Client : ${result.customerAction}`)
  console.log(`Message enregistré : ${result.message.id}`)
  console.log(`Tâche : ${result.taskAction}`)

  return {
    agent: 'EmailAgent',
    status: 'SUCCESS',
    customerId: result.customer.id,
    messageId: result.message.id,
    taskId: result.task?.id ?? null,
    customerAction: result.customerAction,
    taskAction: result.taskAction,
  }
}