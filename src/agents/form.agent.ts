import { processIncomingEmail } from "../workflows/email.workflow"
import type { IncomingEmail } from "../services/message.service"

export type IncomingForm = {
  fromEmail: string
  firstName?: string
  lastName?: string
  phone?: string
  formType: string
  subject: string
  message: string
}

export async function runFormAgent(form: IncomingForm) {
  console.log("\n📝 FormAgent démarré")
  console.log(`Formulaire reçu de : ${form.fromEmail}`)
  console.log(`Type : ${form.formType}`)

  const emailLikeInput: IncomingEmail = {
    fromEmail: form.fromEmail,
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    subject: `[FORMULAIRE] ${form.subject}`,
    body: `
Type de formulaire : ${form.formType}

Message :
${form.message}
    `.trim(),
  }

  const result = await processIncomingEmail(emailLikeInput)

  console.log("\n✅ FormAgent terminé")
  console.log(`Client : ${result.customerAction}`)
  console.log(`Message enregistré : ${result.message.id}`)
  console.log(`Tâche : ${result.taskAction}`)

  return {
    agent: "FormAgent",
    status: "SUCCESS",
    customerId: result.customer.id,
    messageId: result.message.id,
    taskId: result.task?.id ?? null,
    customerAction: result.customerAction,
    taskAction: result.taskAction,
  }
}