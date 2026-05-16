import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import type { EmailRequestType } from './email-analysis.service'

export type KnowledgeBaseEntry = {
  id: string
  category: string
  question: string
  answer: string
  keywords: string[]
  requestType: string | null
  sourceTaskId: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

type CreateKnowledgeBaseEntryInput = {
  category: string
  question: string
  answer: string
  keywords?: string[]
  requestType?: string | null
  sourceTaskId?: string | null
}

type KnowledgeSearchInput = {
  subject: string
  body: string
  requestType?: EmailRequestType | string | null
  limit?: number
}

const STOP_WORDS = new Set([
  'avec',
  'dans',
  'des',
  'les',
  'pour',
  'nous',
  'vous',
  'une',
  'que',
  'qui',
  'sur',
  'aux',
  'est',
  'sont',
  'client',
  'demande',
  'merci',
])

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function clean(value: string) {
  return String(value || '').trim()
}

function isMissingKnowledgeTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')

  return (
    message.includes('KnowledgeBaseEntry') &&
    (message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('table'))
  )
}

function extractKeywords(text: string) {
  const words = normalizeText(text)
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))

  return Array.from(new Set(words)).slice(0, 18)
}

function scoreEntry(entry: KnowledgeBaseEntry, searchText: string, requestType?: string | null) {
  const normalizedSearch = normalizeText(searchText)
  let score = 0

  if (requestType && entry.requestType === requestType) {
    score += 4
  }

  for (const keyword of entry.keywords || []) {
    if (keyword && normalizedSearch.includes(normalizeText(keyword))) {
      score += 2
    }
  }

  const categoryWords = extractKeywords(entry.category)

  for (const word of categoryWords) {
    if (normalizedSearch.includes(word)) {
      score += 1
    }
  }

  return score
}

export function buildKnowledgeContext(entries: KnowledgeBaseEntry[]) {
  if (!entries.length) {
    return 'Aucune connaissance métier pertinente trouvée.'
  }

  return entries
    .map((entry, index) => {
      return `
Connaissance ${index + 1}
Catégorie : ${entry.category}
Type : ${entry.requestType || 'non catégorisé'}
Question couverte : ${entry.question}
Réponse métier fiable :
${entry.answer}
Mots-clés : ${(entry.keywords || []).join(', ') || '-'}
`.trim()
    })
    .join('\n\n')
}

export async function listKnowledgeBaseEntries(limit = 80) {
  try {
    return await prisma.$queryRaw<KnowledgeBaseEntry[]>`
      SELECT id, category, question, answer, keywords, "requestType", "sourceTaskId", active, "createdAt", "updatedAt"
      FROM "KnowledgeBaseEntry"
      WHERE active = true
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `
  } catch (error) {
    if (isMissingKnowledgeTable(error)) {
      console.log('⚠️ Table KnowledgeBaseEntry absente. Lancez npx prisma migrate deploy.')
      return []
    }

    throw error
  }
}

export async function createKnowledgeBaseEntry(input: CreateKnowledgeBaseEntryInput) {
  const category = clean(input.category) || 'Général'
  const question = clean(input.question)
  const answer = clean(input.answer)

  if (!question) {
    throw new Error('Question métier manquante')
  }

  if (!answer) {
    throw new Error('Réponse métier manquante')
  }

  const keywords = input.keywords?.length
    ? input.keywords.map(clean).filter(Boolean)
    : extractKeywords(`${category} ${question} ${answer}`)
  const id = randomUUID()

  await prisma.$executeRaw`
    INSERT INTO "KnowledgeBaseEntry" (
      id, category, question, answer, keywords, "requestType", "sourceTaskId", active, "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${category}, ${question}, ${answer}, ${keywords}, ${input.requestType || null}, ${input.sourceTaskId || null}, true, NOW(), NOW()
    )
  `

  return id
}

export async function removeKnowledgeBaseEntry(id: string) {
  await prisma.$executeRaw`
    UPDATE "KnowledgeBaseEntry"
    SET active = false, "updatedAt" = NOW()
    WHERE id = ${id}
  `
}

export async function findRelevantKnowledge(input: KnowledgeSearchInput) {
  const limit = input.limit || 5
  const candidates = await listKnowledgeBaseEntries(160)
  const searchText = `${input.subject} ${input.body}`

  return candidates
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, searchText, input.requestType),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry)
}
