import { prisma } from '../lib/prisma'

export type IncomingEmail = {
  fromEmail: string
  firstName?: string
  lastName?: string
  phone?: string
  subject: string
  body: string
  receivedAt?: Date
  source?: string
  externalId?: string
  sourceAccount?: string

aiContext?: {
  needsAvailability?: boolean
  availableSlots?: {
    date: string
    weekday: string
    start: string
    end: string
  }[]
  availabilityText?: string | null
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

export async function createInboundMessage(
  customerId: string,
  email: IncomingEmail,
  tx = prisma
) {
  const source = email.source ?? 'EMAIL'
  const externalId = email.externalId ?? null

  if (externalId) {
    const existingMessage = await tx.message.findFirst({
      where: {
        source,
        externalId,
      },
    })

    if (existingMessage) {
      console.log('⚠️ Message déjà traité, doublon technique ignoré')
      return existingMessage
    }
  }

  return tx.message.create({
    data: {
      customerId,
      source,
      direction: 'INBOUND',
      subject: email.subject,
      body: email.body,
      messageType: detectMessageType(email),
      priority: detectPriority(email),
      sentiment: detectSentiment(email),
      requiresHumanValidation: true,
      externalId,
      sourceAccount: email.sourceAccount ?? null,
      createdAt: email.receivedAt ?? new Date(),
    },
  })
}