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
    text.includes('offre') ||
    text.includes('disponibilité')
  ) {
    return 'SALES'
  }

  if (
    text.includes('problème') ||
    text.includes('bug') ||
    text.includes('erreur') ||
    text.includes('aide') ||
    text.includes('support')
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
    text.includes('disponibilité')
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

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function processIncomingEmail(email: IncomingEmail) {
  return prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findUnique({
      where: { email: email.fromEmail },
    })

    let customerAction: 'CREATED' | 'REUSED' = 'REUSED'

    if (!customer) {
      const names = extractNamesFromEmail(email.fromEmail)

      customer = await tx.customer.create({
        data: {
          email: email.fromEmail,
          firstName: names.firstName,
          lastName: names.lastName,
          phone: null,
          tags: ['email-inbound'],
        },
      })

      customerAction = 'CREATED'
    }

    const message = await tx.message.create({
      data: {
        customerId: customer.id,
        source: 'EMAIL',
        direction: 'INBOUND',
        subject: email.subject,
        body: email.body,
        messageType: detectMessageType(email),
        priority: detectPriority(email),
        sentiment: detectSentiment(email),
        requiresHumanValidation: true,
        createdAt: email.receivedAt,
      },
    })

    const messageEvent = await tx.event.create({
      data: {
        eventType: 'MESSAGE_RECEIVED',
        entityType: 'MESSAGE',
        entityId: message.id,
        payload: {
          customerId: customer.id,
          email: email.fromEmail,
          subject: email.subject,
          source: 'EMAIL',
        },
        status: 'PENDING',
      },
    })

    let task = null
    let taskAction: 'CREATED' | 'SKIPPED' | 'ALREADY_EXISTS' = 'SKIPPED'
    let taskEvent = null

    if (shouldCreateFollowUpTask(email)) {
      const expectedTitle = `Relancer client - ${email.subject}`

      const existingOpenTask = await tx.task.findFirst({
        where: {
          customerId: customer.id,
          taskType: 'FOLLOW_UP',
          status: 'TODO',
          title: expectedTitle,
        },
      })

      if (existingOpenTask) {
        task = existingOpenTask
        taskAction = 'ALREADY_EXISTS'
      } else {
        const taskData = buildFollowUpTask(email)

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

        taskEvent = await tx.event.create({
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

        taskAction = 'CREATED'
      }
    }

    await tx.event.update({
      where: { id: messageEvent.id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    })

    if (taskEvent) {
      await tx.event.update({
        where: { id: taskEvent.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      })
    }

    return {
      customer,
      customerAction,
      message,
      messageEventId: messageEvent.id,
      task,
      taskAction,
      taskEventId: taskEvent?.id ?? null,
    }
  })
}

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

  console.log('\n--- Customers ---')
  for (const customer of customers) {
    console.log(`${customer.id} | ${customer.email} | ${customer.firstName} ${customer.lastName ?? ''}`)
  }

  console.log('\n--- Messages ---')
  for (const message of messages) {
    console.log(`${message.id} | ${message.subject} | ${message.messageType} | ${message.priority}`)
  }

  console.log('\n--- Tasks ---')
  for (const task of tasks) {
    console.log(`${task.id} | ${task.title} | ${task.status} | dueAt=${task.dueAt?.toISOString()}`)
  }

  console.log('\n--- Events ---')
  for (const event of events) {
    console.log(`${event.id} | ${event.eventType} | ${event.entityType} | ${event.status}`)
  }
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

  console.log('\n=== DÉMARRAGE TEST WORKFLOW V2 ===')

  for (const [index, email] of testEmails.entries()) {
    const result = await processIncomingEmail(email)

    console.log(`\n--- Scénario ${index + 1} ---`)
    console.log(`Email from       : ${email.fromEmail}`)
    console.log(`Subject          : ${email.subject}`)
    console.log(`Customer action  : ${result.customerAction}`)
    console.log(`Message created  : ${result.message.id}`)
    console.log(`Message event id : ${result.messageEventId}`)
    console.log(`Task action      : ${result.taskAction}`)
    console.log(`Task id          : ${result.task?.id ?? 'Aucune tâche'}`)
    console.log(`Task event id    : ${result.taskEventId ?? 'Aucun événement de tâche'}`)
  }

  await printDatabaseSummary()
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