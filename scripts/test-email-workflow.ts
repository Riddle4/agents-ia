import { runEmailAgent } from '../src/agents/email.agent'
import { disconnectPrisma, prisma } from '../src/lib/prisma'
import type { IncomingEmail } from '../src/services/message.service'

async function printDatabaseSummary() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'asc' },
  })

  const messages = await prisma.message.findMany({
    orderBy: { createdAt: 'asc' },
  })

  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'asc' },
  })

  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'asc' },
  })

  console.log('\n=== RÉSUMÉ BASE ===')
  console.log(`Customers: ${customers.length}`)
  console.log(`Messages : ${messages.length}`)
  console.log(`Tasks    : ${tasks.length}`)
  console.log(`Events   : ${events.length}`)
}

async function main() {
  const now = Date.now()

  const testEmails: IncomingEmail[] = [
    {
      fromEmail: 'marie.dupont@example.com',
      subject: 'Demande de devis pour un anniversaire magique',
      body: `Bonjour,

Je souhaite organiser un anniversaire magique pour ma fille le mois prochain.
Pouvez-vous m’envoyer vos tarifs et disponibilités ?
Merci de me recontacter.

Bien cordialement,
Marie Dupont`,
      receivedAt: new Date(now),
    },
    {
      fromEmail: 'paul.martin@example.com',
      subject: 'Merci pour les informations',
      body: `Bonjour,

Merci pour votre retour.
Je voulais simplement vous informer que j’ai bien reçu les renseignements.

Cordialement,
Paul Martin`,
      receivedAt: new Date(now + 1000),
    },
    {
      fromEmail: 'marie.dupont@example.com',
      subject: 'Demande de devis pour un anniversaire magique',
      body: `Bonjour,

Je me permets de vous réécrire concernant ma demande de devis.
Merci de me recontacter.

Bien cordialement,
Marie Dupont`,
      receivedAt: new Date(now + 2000),
    },
  ]

  console.log('\n=== TEST EMAIL AGENT ===')

  for (const [index, email] of testEmails.entries()) {
    const result = await runEmailAgent(email)

    console.log(`\n--- Scénario ${index + 1} ---`)
    console.log(`Email            : ${email.fromEmail}`)
    console.log(`Sujet            : ${email.subject}`)
    console.log(`Client           : ${result.customerAction}`)
    console.log(`Message créé     : ${result.messageId}`)
    console.log(`Tâche            : ${result.taskAction}`)
    console.log(`Tâche id         : ${result.taskId ?? 'Aucune tâche'}`)
  }

  await printDatabaseSummary()
}

main()
  .catch((error) => {
    console.error('\nErreur pendant le workflow :', error)
    process.exit(1)
  })
  .finally(async () => {
    await disconnectPrisma()
  })