import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL est manquante dans le fichier .env')
}

const pool = new Pool({
  connectionString,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
  adapter,
})

type IncomingEmail = {
  fromEmail: string
  subject: string
  body: string
  receivedAt: Date
}

function extractNamesFromEmail(email: string): { firstName: string | null; lastName: string | null } {
  const localPart = email.split('@')[0] || ''
  const clean = localPart.replace(/[0-9]/g, '')
  const parts = clean.split(/[._-]+/).filter(Boolean)

  if (parts.length === 0) {
    return { firstName: null, lastName: null }
  }

  const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()

  if (parts.length === 1) {
    return { firstName: capitalize(parts[0]), lastName: null }
  }

  return {
    firstName: capitalize(parts[0]),
    lastName: capitalize(parts.slice(1).join(' ')),
  }
}

function detectMessageType(email: IncomingEmail): string {
  const text = `${email.subject} ${email.body}`.toLowerCase()

  if (
    text.includes('devis') ||
    text.includes('prix') ||
    text.includes('tarif') ||
    text.includes('offre')
  ) {
    return 'SALES'
  }

  if (
    text.includes('problème') ||
    text.includes('bug') ||
    text.includes('erreur') ||
    text.includes('aide')
  ) {
    return 'SUPPORT'
  }

  return 'GENERAL'
}

function detectPriority(email: IncomingEmail): string {
  const text = `${email.subject} ${email.body}`.toLowerCase()

  if (
    text.includes('urgent') ||
    text.includes('rapidement') ||
    text.includes('asap')
  ) {
    return 'HIGH'
  }

  return 'NORMAL'
}

function detectSentiment(email: IncomingEmail): string {
  const text = `${email.subject} ${email.body}`.toLowerCase()

  if (
    text.includes('merci') ||
    text.includes('super') ||
    text.includes('parfait')
  ) {
    return 'POSITIVE'
  }

  if (
    text.includes('problème') ||
    text.includes('mécontent') ||
    text.includes('plainte')
  ) {
    return 'NEGATIVE'
  }

  return 'NEUTRAL'
}

function shouldCreateFollowUpTask(email: IncomingEmail): boolean {
  const text = `${email.subject} ${email.body}`.toLowerCase()

  return (
    text.includes('merci de me rappeler') ||
    text.includes('merci de me recontacter') ||
    text.includes('pouvez-vous me rappeler') ||
    text.includes('j’attends votre retour') ||
    text.includes("j'attends votre retour") ||
    text.includes('devis') ||
    text.includes('tarif') ||
    text.includes('disponibilité') ||
    text.includes('quand')
  )
}

function buildFollowUpTask(email: IncomingEmail) {
  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + 2)

  return {
    taskType: 'FOLLOW_UP',
    title: `Relancer client - ${email.subject}`,
    description: `Le client a envoyé un email nécessitant un suivi.\n\nSujet : ${email.subject}\n\nMessage : ${email.body}`,
    status: 'TODO',
    dueAt,
  }
}

async function main() {
  // 1. Simulation d’un email entrant
  const incomingEmail: IncomingEmail = {
    fromEmail: 'marie.dupont@example.com',
    subject: 'Demande de devis pour un anniversaire magique',
    body: `Bonjour,

Je souhaite organiser un anniversaire magique pour ma fille le mois prochain.
Pouvez-vous m’envoyer vos tarifs et disponibilités ?
Merci de me recontacter.

Bien cordialement,
Marie Dupont`,
    receivedAt: new Date(),
  }

  const result = await prisma.$transaction(async (tx) => {
    // 2. Trouver ou créer le client
    let customer = await tx.customer.findUnique({
      where: { email: incomingEmail.fromEmail },
    })

    if (!customer) {
      const names = extractNamesFromEmail(incomingEmail.fromEmail)

      customer = await tx.customer.create({
        data: {
          email: incomingEmail.fromEmail,
          firstName: names.firstName,
          lastName: names.lastName,
          phone: null,
          tags: ['email-inbound'],
        },
      })
    }

    // 3. Enregistrer le message
    const message = await tx.message.create({
      data: {
        customerId: customer.id,
        source: 'EMAIL',
        direction: 'INBOUND',
        subject: incomingEmail.subject,
        body: incomingEmail.body,
        messageType: detectMessageType(incomingEmail),
        priority: detectPriority(incomingEmail),
        sentiment: detectSentiment(incomingEmail),
        requiresHumanValidation: true,
        createdAt: incomingEmail.receivedAt,
      },
    })

    // 4. Créer un événement associé
    const event = await tx.event.create({
      data: {
        eventType: 'MESSAGE_RECEIVED',
        entityType: 'MESSAGE',
        entityId: message.id,
        payload: {
          customerId: customer.id,
          email: incomingEmail.fromEmail,
          subject: incomingEmail.subject,
          source: 'EMAIL',
        },
        status: 'PENDING',
      },
    })

    // 5. Créer une tâche si nécessaire
    let task = null

    if (shouldCreateFollowUpTask(incomingEmail)) {
      const taskData = buildFollowUpTask(incomingEmail)

      task = await tx.task.create({
        data: {
          customerId: customer.id,
          taskType: taskData.taskType,
          title: taskData.title,
          description: taskData.description,
          status: taskData.status,
          dueAt: taskData.dueAt,
        },
      })

      // Optionnel mais utile : un deuxième événement pour tracer la tâche créée
      await tx.event.create({
        data: {
          eventType: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: task.id,
          payload: {
            customerId: customer.id,
            taskType: task.taskType,
            title: task.title,
          },
          status: 'PENDING',
        },
      })
    }

    return { customer, message, event, task }
  })

  console.log('\n=== WORKFLOW TERMINÉ ===\n')
  console.log('Customer :', result.customer)
  console.log('\nMessage :', result.message)
  console.log('\nEvent :', result.event)
  console.log('\nTask :', result.task)
}

main()
  .catch((error) => {
    console.error('\nErreur pendant le workflow :', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })