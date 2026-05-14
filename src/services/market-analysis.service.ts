import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { prisma } from "../lib/prisma"

export type MarketDomain = "ANNIVERSAIRE" | "STAGE" | "COURS"

type SearchResult = {
  title: string
  link: string
  snippet?: string
}

type MarketOffer = {
  title?: string | null
  description?: string | null
  price?: number | null
  currency?: string | null
  duration?: string | null
  location?: string | null
  confidence?: number | null
  ageMin?: number | null
  ageMax?: number | null
  sourceUrl: string
}

type AnalyzedMarketPage = {
  competitorName?: string
  website?: string
  domain?: MarketDomain
  offer?: MarketOffer
  isRelevant: boolean
}

type MarketAlertRow = {
  id: string
  type: string
  message: string
  domain: string
  competitor: string | null
  createdAt: Date
  isRead: boolean
}

type MarketScanRow = {
  id: string
  domain: string
  startedAt: Date
  finishedAt: Date | null
  status: string
}

type ExistingCompetitorRow = {
  id: string
  name: string
}

type ExistingOfferRow = {
  id: string
  price: number | null
  status: string
}

type MarketOfferResultRow = {
  competitorId: string
  competitorName: string
  website: string | null
  offerId: string
  domain: string
  title: string | null
  description: string | null
  price: number | null
  currency: string | null
  duration: string | null
  location: string | null
  ageMin: number | null
  ageMax: number | null
  sourceUrl: string | null
  confidence: number | null
  detectedAt: Date
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const marketDomains: MarketDomain[] = ["ANNIVERSAIRE", "STAGE", "COURS"]

const queriesByDomain: Record<MarketDomain, string[]> = {
  ANNIVERSAIRE: [
    "magicien anniversaire enfant Suisse romande",
    "animation magie anniversaire enfant Vaud Genève",
    "anniversaire magique enfant Lausanne Genève Fribourg Neuchâtel Jura Valais",
    "spectacle magie anniversaire enfant Suisse romande",
    "magicien enfant anniversaire domicile Suisse romande",
  ],
  STAGE: [
    "stage magie enfants vacances Vaud Genève",
    "atelier magie enfants vacances Suisse romande",
    "stage magie enfant Lausanne Genève Fribourg Neuchâtel",
    "cours stage magie vacances enfant Suisse romande",
    "atelier magie vacances scolaires Vaud Genève Valais",
  ],
  COURS: [
    "cours magie enfants Lausanne Genève Vaud",
    "école de magie enfants Suisse romande",
    "cours de magie Suisse romande enfant adulte",
    "apprendre magie Lausanne Genève Fribourg Neuchâtel",
    "école cours magicien Vaud Genève Valais",
  ],
}

export function isMarketDomain(value: string): value is MarketDomain {
  return marketDomains.includes(value as MarketDomain)
}

export async function loadMarketDashboardSnapshot() {
  try {
    const [alerts, scans, alertCounts, offerCounts, domainCounts] = await Promise.all([
      prisma.$queryRaw<MarketAlertRow[]>`
        SELECT id, type, message, domain, competitor, "createdAt", "isRead"
        FROM "MarketAlert"
        ORDER BY "createdAt" DESC
        LIMIT 200
      `,
      prisma.$queryRaw<MarketScanRow[]>`
        SELECT id, domain, "startedAt", "finishedAt", status
        FROM "MarketScan"
        ORDER BY "startedAt" DESC
        LIMIT 5
      `,
      prisma.$queryRaw<{ total: bigint; unread: bigint }[]>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "isRead" = false)::bigint AS unread
        FROM "MarketAlert"
      `,
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total
        FROM "MarketOffer"
      `,
      prisma.$queryRaw<{ domain: string; total: bigint }[]>`
        SELECT domain, COUNT(*)::bigint AS total
        FROM "MarketOffer"
        GROUP BY domain
      `,
    ])

    return {
      isReady: true,
      alerts,
      scans,
      totalAlerts: Number(alertCounts[0]?.total || 0),
      unreadAlerts: Number(alertCounts[0]?.unread || 0),
      totalOffers: Number(offerCounts[0]?.total || 0),
      domainCounts: Object.fromEntries(domainCounts.map((item) => [item.domain, Number(item.total)])),
    }
  } catch {
    return {
      isReady: false,
      alerts: [] as MarketAlertRow[],
      scans: [] as MarketScanRow[],
      totalAlerts: 0,
      unreadAlerts: 0,
      totalOffers: 0,
      domainCounts: {} as Record<string, number>,
    }
  }
}

export async function loadMarketDomainResults(domain: MarketDomain) {
  try {
    return await prisma.$queryRaw<MarketOfferResultRow[]>`
      SELECT
        c.id AS "competitorId",
        c.name AS "competitorName",
        c.website,
        o.id AS "offerId",
        o.domain,
        o.title,
        o.description,
        o.price,
        o.currency,
        o.duration,
        o.location,
        o."ageMin",
        o."ageMax",
        o."sourceUrl",
        o.confidence,
        o."detectedAt"
      FROM "MarketOffer" o
      INNER JOIN "MarketCompetitor" c ON c.id = o."competitorId"
      WHERE o.domain = ${domain}
      ORDER BY o."detectedAt" DESC, c.name ASC
      LIMIT 100
    `
  } catch {
    return [] as MarketOfferResultRow[]
  }
}

export async function runMarketAnalysis(domainToScan?: MarketDomain) {
  const summary = {
    scannedDomains: 0,
    analyzedUrls: 0,
    relevantOffers: 0,
    createdAlerts: 0,
    errors: [] as string[],
  }

  const domains = domainToScan ? [domainToScan] : marketDomains

  for (const domain of domains) {
    summary.scannedDomains += 1

    const scanId = randomUUID()

    await prisma.$executeRaw`
      INSERT INTO "MarketScan" (id, domain, region, status)
      VALUES (${scanId}, ${domain}, ${"Suisse romande"}, ${"RUNNING"})
    `

    try {
      const results = await searchCompetitorUrls(domain)

      for (const result of results) {
        try {
          const text = await scrapePageText(result.link)
          const analyzed = await analyzeMarketPage({
            domain,
            title: result.title,
            url: result.link,
            text,
          })

          summary.analyzedUrls += 1

          if (!analyzed.isRelevant || !analyzed.competitorName || !analyzed.website || !analyzed.offer) {
            continue
          }

          summary.relevantOffers += 1

          const createdAlert = await persistAnalyzedOffer({
            scanId,
            domain,
            text,
            analyzed,
          })

          if (createdAlert) {
            summary.createdAlerts += 1
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erreur inconnue"
          summary.errors.push(`${result.link}: ${message}`)
        }
      }

      await prisma.$executeRaw`
        UPDATE "MarketScan"
        SET status = ${"DONE"}, "finishedAt" = CURRENT_TIMESTAMP
        WHERE id = ${scanId}
      `
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue"
      summary.errors.push(`${domain}: ${message}`)

      await prisma.$executeRaw`
        UPDATE "MarketScan"
        SET status = ${"ERROR"}, "finishedAt" = CURRENT_TIMESTAMP
        WHERE id = ${scanId}
      `
    }
  }

  return summary
}

async function searchCompetitorUrls(domain: MarketDomain) {
  const apiKey = process.env.SERPER_API_KEY

  if (!apiKey) {
    throw new Error("SERPER_API_KEY manquant dans .env")
  }

  const results: SearchResult[] = []

  for (const q of queriesByDomain[domain]) {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q,
        gl: "ch",
        hl: "fr",
        num: 10,
      }),
    })

    if (!response.ok) {
      throw new Error(`Erreur Serper: ${response.status}`)
    }

    const data = await response.json()
    results.push(...((data.organic || []) as SearchResult[]))
  }

  const unique = new Map<string, SearchResult>()

  for (const result of results) {
    if (result.link && !unique.has(result.link)) {
      unique.set(result.link, result)
    }
  }

  return Array.from(unique.values())
}

async function scrapePageText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 CosmoIA-SPECTRA/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`Impossible de lire ${url}: ${response.status}`)
  }

  const html = await response.text()

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000)
}

async function analyzeMarketPage(input: {
  domain: MarketDomain
  title: string
  url: string
  text: string
}): Promise<AnalyzedMarketPage> {
  const prompt = `
Tu es SPECTRA, agent de veille concurrentielle pour le Centre de Magie de la Côte.

Analyse la page suivante et détermine si elle présente un concurrent ou une offre commerciale pertinente en Suisse romande.

DOMAINE CIBLE : ${input.domain}
TITRE DU RÉSULTAT : ${input.title}
URL : ${input.url}

RÈGLES :
- Pour ANNIVERSAIRE, considère pertinent un magicien, artiste ou prestataire qui propose ou semble proposer des anniversaires, spectacles enfants, animations enfants ou magie à domicile.
- Pour STAGE, considère pertinent un prestataire qui propose ou semble proposer stages, ateliers vacances, ateliers enfants ou activités magie.
- Pour COURS, considère pertinent une école, un magicien ou une structure qui propose ou semble proposer des cours, formations ou ateliers réguliers de magie.
- Ne rejette pas une page seulement parce que le prix n'est pas visible.
- Ignore seulement les blogs purs, articles éditoriaux, annuaires sans prestataire identifiable, boutiques sans prestation et pages hors Suisse romande.
- Ne retourne QUE du JSON valide.
- Si le concurrent semble pertinent mais que certains champs manquent, garde isRelevant=true et mets les champs inconnus à null.

EXTRAIS :
- isRelevant (boolean)
- domain (ANNIVERSAIRE | STAGE | COURS)
- competitorName
- title
- price (number ou null)
- currency (CHF si détecté)
- duration
- location
- ageMin
- ageMax
- description
- confidence (0 à 1)

PAGE :
${input.text.slice(0, 8000)}
`

  const response = await openai.chat.completions.create({
    model: process.env.MARKET_ANALYSIS_MODEL || "gpt-5",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "Tu réponds uniquement en JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  const content = response.choices[0]?.message?.content || "{}"

  try {
    const parsed = parseJsonObject(content)

    return {
      competitorName: parsed.competitorName || input.title,
      website: input.url,
      domain: parsed.domain || input.domain,
      offer: {
        title: parsed.title || input.title,
        description: parsed.description,
        price: typeof parsed.price === "number" ? parsed.price : null,
        currency: parsed.currency || null,
        duration: parsed.duration || null,
        location: parsed.location || null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        ageMin: typeof parsed.ageMin === "number" ? parsed.ageMin : null,
        ageMax: typeof parsed.ageMax === "number" ? parsed.ageMax : null,
        sourceUrl: input.url,
      },
      isRelevant: Boolean(parsed.isRelevant),
    }
  } catch {
    return {
      isRelevant: false,
    }
  }
}

function parseJsonObject(content: string) {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")

  try {
    return JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf("{")
    const end = withoutFence.lastIndexOf("}")

    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1))
    }

    throw new Error("JSON IA invalide")
  }
}

async function persistAnalyzedOffer(input: {
  scanId: string
  domain: MarketDomain
  text: string
  analyzed: AnalyzedMarketPage
}) {
  const offer = input.analyzed.offer

  if (!offer || !input.analyzed.competitorName || !input.analyzed.website) {
    return false
  }

  const existingCompetitors = await prisma.$queryRaw<ExistingCompetitorRow[]>`
    SELECT id, name
    FROM "MarketCompetitor"
    WHERE website = ${input.analyzed.website}
    LIMIT 1
  `

  const competitor =
    existingCompetitors[0] ||
    (await createCompetitor({
      name: input.analyzed.competitorName,
      website: input.analyzed.website,
    }))

  const existingOffers = await prisma.$queryRaw<ExistingOfferRow[]>`
    SELECT id, price, status
    FROM "MarketOffer"
    WHERE "competitorId" = ${competitor.id}
      AND domain = ${input.domain}
      AND "sourceUrl" = ${offer.sourceUrl}
    LIMIT 1
  `

  const newStatus = "UNKNOWN"
  const newPrice = offer.price ?? null

  if (existingOffers[0]) {
    const existingOffer = existingOffers[0]
    const priceChanged = existingOffer.price !== null && newPrice !== null && existingOffer.price !== newPrice
    const statusChanged = existingOffer.status !== newStatus

    if (priceChanged || statusChanged) {
      await prisma.$executeRaw`
        INSERT INTO "MarketOfferHistory" (id, "offerId", price, status)
        VALUES (${randomUUID()}, ${existingOffer.id}, ${existingOffer.price}, ${existingOffer.status})
      `

      await updateOffer(existingOffer.id, offer, newStatus)

      await createAlert({
        type: priceChanged ? "PRICE_CHANGE" : "STATUS_CHANGE",
        message: priceChanged
          ? `${competitor.name} a changé son prix : CHF ${existingOffer.price} → CHF ${newPrice}`
          : `${competitor.name} a changé le statut de son offre.`,
        domain: input.domain,
        competitor: competitor.name,
      })

      await createExtractedData(input.scanId, input.domain, competitor.name, input.text, input.analyzed, offer)
      return true
    }

    await createExtractedData(input.scanId, input.domain, competitor.name, input.text, input.analyzed, offer)
    return false
  }

  await createOffer(competitor.id, input.domain, offer, newStatus)

  await createAlert({
    type: "NEW_OFFER",
    message: `Nouvelle offre détectée chez ${competitor.name}`,
    domain: input.domain,
    competitor: competitor.name,
  })

  await createExtractedData(input.scanId, input.domain, competitor.name, input.text, input.analyzed, offer)
  return true
}

async function createCompetitor(input: { name: string; website: string }) {
  const id = randomUUID()

  await prisma.$executeRaw`
    INSERT INTO "MarketCompetitor" (id, name, website, region)
    VALUES (${id}, ${input.name}, ${input.website}, ${"Suisse romande"})
  `

  return {
    id,
    name: input.name,
  }
}

async function createOffer(competitorId: string, domain: MarketDomain, offer: MarketOffer, status: string) {
  await prisma.$executeRaw`
    INSERT INTO "MarketOffer" (
      id, "competitorId", domain, title, description, price, currency, duration,
      location, "ageMin", "ageMax", status, "sourceUrl", confidence
    )
    VALUES (
      ${randomUUID()}, ${competitorId}, ${domain}, ${offer.title || null}, ${offer.description || null},
      ${offer.price ?? null}, ${offer.currency || null}, ${offer.duration || null},
      ${offer.location || null}, ${offer.ageMin ?? null}, ${offer.ageMax ?? null},
      ${status}, ${offer.sourceUrl}, ${offer.confidence ?? null}
    )
  `
}

async function updateOffer(offerId: string, offer: MarketOffer, status: string) {
  await prisma.$executeRaw`
    UPDATE "MarketOffer"
    SET title = ${offer.title || null},
        description = ${offer.description || null},
        price = ${offer.price ?? null},
        currency = ${offer.currency || null},
        duration = ${offer.duration || null},
        location = ${offer.location || null},
        "ageMin" = ${offer.ageMin ?? null},
        "ageMax" = ${offer.ageMax ?? null},
        status = ${status},
        confidence = ${offer.confidence ?? null},
        "detectedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${offerId}
  `
}

async function createAlert(input: {
  type: string
  message: string
  domain: MarketDomain
  competitor: string
}) {
  await prisma.$executeRaw`
    INSERT INTO "MarketAlert" (id, type, message, domain, competitor)
    VALUES (${randomUUID()}, ${input.type}, ${input.message}, ${input.domain}, ${input.competitor})
  `
}

async function createExtractedData(
  scanId: string,
  domain: MarketDomain,
  competitor: string,
  text: string,
  analyzed: AnalyzedMarketPage,
  offer: MarketOffer,
) {
  await prisma.$executeRaw`
    INSERT INTO "MarketExtractedData" (
      id, "marketScanId", competitor, domain, "rawContent", "parsedData", confidence, "sourceUrl"
    )
    VALUES (
      ${randomUUID()}, ${scanId}, ${competitor}, ${domain}, ${text.slice(0, 4000)},
      ${JSON.stringify(analyzed)}::jsonb, ${offer.confidence ?? null}, ${offer.sourceUrl}
    )
  `
}
