import { prisma } from '../lib/prisma'

const AUTO_SENDER_PATTERNS = [
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'accounts.google.com',
]

const DEFAULT_IGNORED_SENDERS = [
  'ads-noreply@google.com',
]

export function normalizeSenderEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isAutomaticSender(email: string) {
  const normalized = normalizeSenderEmail(email)

  return AUTO_SENDER_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export async function isIgnoredSender(email: string, tx = prisma) {
  const normalized = normalizeSenderEmail(email)

  if (!normalized) {
    return true
  }

  if (DEFAULT_IGNORED_SENDERS.includes(normalized) || isAutomaticSender(normalized)) {
    return true
  }

  const ignoredSender = await tx.ignoredSender.findUnique({
    where: {
      email: normalized,
    },
  })

  return Boolean(ignoredSender)
}

export async function addIgnoredSender(email: string, reason?: string | null) {
  const normalized = normalizeSenderEmail(email)

  if (!normalized) {
    throw new Error('Adresse email manquante')
  }

  return prisma.ignoredSender.upsert({
    where: {
      email: normalized,
    },
    create: {
      email: normalized,
      reason: reason?.trim() || null,
    },
    update: {
      reason: reason?.trim() || null,
    },
  })
}

export async function removeIgnoredSender(id: string) {
  return prisma.ignoredSender.delete({
    where: {
      id,
    },
  })
}

export async function listIgnoredSenders() {
  return prisma.ignoredSender.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  })
}

