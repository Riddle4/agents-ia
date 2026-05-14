import OpenAI from "openai"
import * as XLSX from "xlsx"
import { prisma } from "../lib/prisma"

export const PHOENIX_SERVICES = [
  { code: "COURS_COLLECTIF_ENFANT", name: "Cours de magie collectifs enfants", category: "COURSE", estimatedValue: 480 },
  { code: "ANIMATION_INSTITUTIONNELLE", name: "Animations magiques pour clients institutionnels", category: "ORGANIZATION", estimatedValue: 1200 },
  { code: "STAGE_PAQUES", name: "Stages de magie de Pâques", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_ETE_1", name: "Stage de magie été 1", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_ETE_2", name: "Stage de magie été 2", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_ETE_3", name: "Stage de magie été 3", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_ETE_4", name: "Stage de magie été 4", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_ETE_5", name: "Stage de magie été 5", category: "STAGE", estimatedValue: 390 },
  { code: "STAGE_HALLOWEEN", name: "Stage de magie de Halloween", category: "STAGE", estimatedValue: 390 },
  { code: "ANNIVERSAIRE_MAGIQUE", name: "Anniversaires magiques", category: "BIRTHDAY", estimatedValue: 590 },
  { code: "ESCAPE_SORCIERS", name: "Escape game L’École des Sorciers", category: "ESCAPE", estimatedValue: 160 },
  { code: "ESCAPE_PIERRE", name: "Escape game La Pierre Philosophale", category: "ESCAPE", estimatedValue: 160 },
]

export const PHOENIX_IMPORT_TYPES = ["cours", "stages", "animations externes", "anniversaires", "escape games", "générique"]

export const PHOENIX_FIELDS = [
  "childFirstName",
  "childLastName",
  "childBirthDate",
  "parentFirstName",
  "parentLastName",
  "email",
  "phone",
  "organizationName",
  "service",
  "bookingDate",
  "amount",
  "notes",
]

type ParsedWorkbook = {
  headers: string[]
  rows: Record<string, string>[]
}

type Mapping = Record<string, string>

type NormalizedRow = {
  childFirstName?: string
  childLastName?: string
  childBirthDate?: Date | null
  parentFirstName?: string
  parentLastName?: string
  email?: string
  phone?: string
  organizationName?: string
  service?: string
  bookingDate?: Date | null
  amount?: number | null
  notes?: string
}

let openai: OpenAI | null = null

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

export async function ensurePhoenixServices() {
  for (const service of PHOENIX_SERVICES) {
    await prisma.phoenixService.upsert({
      where: { code: service.code },
      create: service,
      update: {
        name: service.name,
        category: service.category,
      },
    })
  }
}

export async function loadPhoenixDashboard() {
  await ensurePhoenixServices()
  const [services, people, families, organizations, bookings, opportunities] = await Promise.all([
    prisma.phoenixService.findMany({ orderBy: { name: "asc" } }),
    prisma.phoenixPerson.findMany({ orderBy: { updatedAt: "desc" }, take: 40, include: { family: true, organization: true } }),
    prisma.phoenixFamily.findMany({ orderBy: { updatedAt: "desc" }, take: 40, include: { people: true } }),
    prisma.phoenixOrganization.findMany({ orderBy: { updatedAt: "desc" }, take: 40 }),
    prisma.phoenixBooking.findMany({ orderBy: { bookingDate: "desc" }, take: 40, include: { service: true, child: true, organization: true } }),
    prisma.phoenixOpportunity.findMany({ orderBy: [{ status: "asc" }, { estimatedRevenue: "desc" }], take: 80, include: { service: true, person: true, family: true, organization: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } }),
  ])
  const totalPotential = opportunities.filter((item) => item.status === "OPEN").reduce((sum, item) => sum + item.estimatedRevenue, 0)
  return { services, people, families, organizations, bookings, opportunities, totalPotential }
}

export function parseExcel(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false })
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cleanText(normalizeCell(cell))))

  if (headerIndex === -1) {
    return { headers: [], rows: [] }
  }

  const headers = matrix[headerIndex]
    .map((cell, index) => cleanText(normalizeCell(cell)) || `Colonne ${index + 1}`)
    .map((header, index, allHeaders) => makeUniqueHeader(header, index, allHeaders))

  const rows = matrix.slice(headerIndex + 1).map((row) => {
    return Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])]))
  }).filter((row) => Object.values(row).some((value) => cleanText(value)))

  return {
    headers,
    rows,
  }
}

export async function createImportPreview(params: { filename: string; importType: string; buffer: Buffer }) {
  await ensurePhoenixServices()
  const parsed = parseExcel(params.buffer)
  const batch = await prisma.phoenixImportBatch.create({
    data: {
      filename: params.filename,
      importType: params.importType,
      rawRows: parsed.rows,
      rowCount: parsed.rows.length,
      mapping: suggestMapping(parsed.headers),
    },
  })
  return { batch, headers: parsed.headers, rows: parsed.rows.slice(0, 20), mapping: suggestMapping(parsed.headers) }
}

export async function commitImport(batchId: string, mapping: Mapping) {
  await ensurePhoenixServices()
  const batch = await prisma.phoenixImportBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error("Import introuvable")
  const rows = Array.isArray(batch.rawRows) ? (batch.rawRows as Record<string, string>[]) : []
  let importedCount = 0
  let duplicateCount = 0

  for (const row of rows) {
    const normalized = normalizeRow(row, mapping)
    if (!hasUsefulData(normalized)) continue
    const imported = await importNormalizedRow(normalized, batch.importType, batch.id)
    importedCount += imported.imported ? 1 : 0
    duplicateCount += imported.duplicate ? 1 : 0
  }

  await generateOpportunities()

  await prisma.phoenixImportBatch.update({
    where: { id: batch.id },
    data: { status: "IMPORTED", mapping, importedCount, duplicateCount },
  })

  return { importedCount, duplicateCount }
}

export async function generateOpportunities() {
  await ensurePhoenixServices()
  await generateFamilyOpportunities()
  await generateOrganizationOpportunities()
}

async function generateFamilyOpportunities() {
  const services = await prisma.phoenixService.findMany()
  const serviceByCode = new Map(services.map((service) => [service.code, service]))
  const families = await prisma.phoenixFamily.findMany({
    include: {
      people: true,
      bookings: { include: { service: true } },
    },
  })

  for (const family of families) {
    const child = family.people.find((person) => person.type === "CHILD") || family.people[0]
    if (!child) continue
    const serviceCodes = new Set(family.bookings.map((booking) => booking.service.code))
    const rules = [
      { code: "COURS_COLLECTIF_ENFANT", type: "COURSE_YEARLY", title: "Proposer un cours collectif enfant", reason: "Parcours annuel idéal : un enfant suit un cours collectif chaque année." },
      { code: "STAGE_ETE_1", type: "STAGE_YEARLY", title: "Proposer une semaine de stage", reason: "Parcours annuel idéal : participer à une ou plusieurs semaines de stages." },
      { code: "ANNIVERSAIRE_MAGIQUE", type: "BIRTHDAY_YEARLY", title: "Proposer un anniversaire magique", reason: "Parcours annuel idéal : organiser un anniversaire magique." },
      { code: "ESCAPE_SORCIERS", type: "ESCAPE_LIFETIME", title: "Proposer L’École des Sorciers", reason: "Parcours client : vivre au moins une fois l’escape game L’École des Sorciers." },
      { code: "ESCAPE_PIERRE", type: "ESCAPE_LIFETIME", title: "Proposer La Pierre Philosophale", reason: "Parcours client : vivre au moins une fois l’escape game La Pierre Philosophale." },
    ]

    for (const rule of rules) {
      if (serviceCodes.has(rule.code)) continue
      const service = serviceByCode.get(rule.code)
      if (!service) continue
      await upsertOpportunity({
        serviceId: service.id,
        personId: child.id,
        familyId: family.id,
        type: rule.type,
        title: `${rule.title} · ${family.name}`,
        reason: rule.reason,
        estimatedRevenue: service.estimatedValue,
        priority: rule.code.includes("ANNIVERSAIRE") ? "HIGH" : "MEDIUM",
      })
    }
  }
}

async function generateOrganizationOpportunities() {
  const organizations = await prisma.phoenixOrganization.findMany({ include: { bookings: { include: { service: true } } } })
  const services = await prisma.phoenixService.findMany()
  const animation = services.find((service) => service.code === "ANIMATION_INSTITUTIONNELLE")
  const escapeService = services.find((service) => service.code === "ESCAPE_SORCIERS")
  if (!animation) return

  for (const organization of organizations) {
    if (!organization.bookings.length) continue
    const targets = [
      { service: animation, type: "ORG_ANIMATION", title: "Relancer pour une nouvelle animation", reason: "L’organisation a déjà réservé une animation : relance naturelle pour événement annuel, Noël, spectacle ou collaborateurs." },
      { service: escapeService || animation, type: "ORG_TEAM_BUILDING", title: "Proposer un team building ou escape game", reason: "Une institution déjà cliente peut être relancée pour team building, escape game ou animation collaborateurs." },
    ]
    for (const target of targets) {
      await upsertOpportunity({
        serviceId: target.service.id,
        organizationId: organization.id,
        type: target.type,
        title: `${target.title} · ${organization.name}`,
        reason: target.reason,
        estimatedRevenue: target.service.estimatedValue,
        priority: "HIGH",
      })
    }
  }
}

async function upsertOpportunity(input: { serviceId: string; personId?: string; familyId?: string; organizationId?: string; type: string; title: string; reason: string; estimatedRevenue: number; priority: string }) {
  const existing = await prisma.phoenixOpportunity.findFirst({
    where: {
      serviceId: input.serviceId,
      personId: input.personId || null,
      familyId: input.familyId || null,
      organizationId: input.organizationId || null,
      type: input.type,
      status: { not: "WON" },
    },
  })
  if (existing) return existing
  return prisma.phoenixOpportunity.create({ data: input })
}

export async function generateOpportunityMessage(opportunityId: string, channel: string) {
  const opportunity = await prisma.phoenixOpportunity.findUnique({
    where: { id: opportunityId },
    include: { service: true, person: true, family: true, organization: true },
  })
  if (!opportunity) throw new Error("Opportunité introuvable")

  const targetName = opportunity.organization?.name || opportunity.family?.name || [opportunity.person?.firstName, opportunity.person?.lastName].filter(Boolean).join(" ") || "ce client"
  const fallback = buildFallbackMessage(targetName, opportunity.service.name, opportunity.reason, channel)
  const client = getOpenAIClient()
  let content = fallback

  if (client) {
    const response = await client.responses.create({
      model: process.env.PHOENIX_COPYWRITER_MODEL || "gpt-5",
      input: `Tu es Phoenix CRM pour le Centre de Magie de la Côte. Rédige un message de relance ${channel} chaleureux, court, commercial mais humain.\n\nClient: ${targetName}\nService: ${opportunity.service.name}\nRaison: ${opportunity.reason}\nPotentiel estimé: CHF ${opportunity.estimatedRevenue}\n\nNe promets aucune disponibilité. Termine par une question simple.`,
    })
    content = response.output_text?.trim() || fallback
  }

  return prisma.phoenixGeneratedMessage.create({
    data: {
      opportunityId,
      channel,
      subject: channel === "email" ? `Une idée magique pour ${targetName}` : null,
      content,
    },
  })
}

export async function createManualPerson(data: { type: string; firstName?: string; lastName?: string; email?: string; phone?: string; notes?: string }) {
  const normalizedEmail = normalizeEmail(data.email)
  const normalizedPhone = normalizePhone(data.phone)
  const family = data.type === "CHILD" || data.type === "PARENT" ? await findOrCreateFamily(data.lastName, data.email, data.phone) : null
  return prisma.phoenixPerson.create({ data: { ...data, normalizedEmail, normalizedPhone, familyId: family?.id } })
}

export async function createManualOrganization(data: { name: string; email?: string; phone?: string; website?: string; type?: string; notes?: string }) {
  return prisma.phoenixOrganization.create({ data })
}

export async function updateOpportunityStatus(id: string, status: string) {
  return prisma.phoenixOpportunity.update({ where: { id }, data: { status } })
}

async function importNormalizedRow(row: NormalizedRow, importType: string, batchId: string) {
  const service = await resolveService(row.service, importType)
  let family = null
  let child = null
  let parent = null
  let organization = null

  if (row.organizationName || importType.includes("animation")) {
    organization = await findOrCreateOrganization(row.organizationName || row.parentLastName || row.email || "Organisation sans nom", row)
  }

  if (row.childFirstName || row.childLastName || (!organization && row.email)) {
    family = await findOrCreateFamily(row.childLastName || row.parentLastName, row.email, row.phone)
    child = row.childFirstName || row.childLastName ? await findOrCreatePerson("CHILD", row.childFirstName, row.childLastName, row.email, row.phone, family.id, null, row.childBirthDate) : null
    parent = row.parentFirstName || row.parentLastName || row.email ? await findOrCreatePerson("PARENT", row.parentFirstName, row.parentLastName || row.childLastName, row.email, row.phone, family.id, null, null) : null
  }

  if (organization && row.email) {
    await findOrCreatePerson("CONTACT", row.parentFirstName, row.parentLastName, row.email, row.phone, null, organization.id, null)
  }

  const existingBooking = await prisma.phoenixBooking.findFirst({
    where: {
      serviceId: service.id,
      childId: child?.id || null,
      organizationId: organization?.id || null,
      bookingDate: row.bookingDate || null,
    },
  })
  if (existingBooking) {
    return { imported: false, duplicate: true }
  }

  await prisma.phoenixBooking.create({
    data: {
      serviceId: service.id,
      childId: child?.id,
      parentId: parent?.id,
      familyId: family?.id,
      organizationId: organization?.id,
      importBatchId: batchId,
      bookingDate: row.bookingDate || undefined,
      amount: row.amount || undefined,
      sourceType: importType,
      sourceLabel: row.service,
      notes: row.notes,
    },
  })

  return { imported: true, duplicate: false }
}

async function resolveService(rawService: string | undefined, importType: string) {
  await ensurePhoenixServices()
  const text = `${rawService || ""} ${importType}`.toLowerCase()
  const code = text.includes("pierre")
    ? "ESCAPE_PIERRE"
    : text.includes("sorcier") || text.includes("escape")
      ? "ESCAPE_SORCIERS"
      : text.includes("anniv")
        ? "ANNIVERSAIRE_MAGIQUE"
        : text.includes("halloween")
          ? "STAGE_HALLOWEEN"
          : text.includes("pâques") || text.includes("paques")
            ? "STAGE_PAQUES"
            : text.includes("stage") || importType.includes("stage")
              ? "STAGE_ETE_1"
              : text.includes("cours") || importType.includes("cours")
                ? "COURS_COLLECTIF_ENFANT"
                : text.includes("animation") || importType.includes("animation")
                  ? "ANIMATION_INSTITUTIONNELLE"
                  : "COURS_COLLECTIF_ENFANT"
  return prisma.phoenixService.findUniqueOrThrow({ where: { code } })
}

async function findOrCreateFamily(lastName?: string, email?: string, phone?: string) {
  const name = lastName ? `Famille ${toTitleCase(lastName)}` : email ? `Famille ${email}` : "Famille sans nom"
  const existing = email ? await prisma.phoenixFamily.findFirst({ where: { email: normalizeEmail(email) || email } }) : null
  if (existing) return existing
  return prisma.phoenixFamily.create({ data: { name, email: normalizeEmail(email), phone: normalizePhone(phone) } })
}

async function findOrCreateOrganization(name: string, row: NormalizedRow) {
  const cleanedName = cleanText(name) || "Organisation sans nom"
  const existing = await prisma.phoenixOrganization.findFirst({ where: { name: { equals: cleanedName, mode: "insensitive" } } })
  if (existing) return existing
  return prisma.phoenixOrganization.create({ data: { name: cleanedName, email: normalizeEmail(row.email), phone: normalizePhone(row.phone), type: "Institution" } })
}

async function findOrCreatePerson(type: string, firstName?: string, lastName?: string, email?: string, phone?: string, familyId?: string | null, organizationId?: string | null, birthDate?: Date | null) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhone(phone)
  const existing = await prisma.phoenixPerson.findFirst({
    where: {
      type,
      OR: [
        normalizedEmail ? { normalizedEmail } : undefined,
        normalizedPhone ? { normalizedPhone } : undefined,
        firstName || lastName ? { firstName: cleanText(firstName), lastName: cleanText(lastName) } : undefined,
      ].filter(Boolean) as any,
    },
  })
  if (existing) return existing
  return prisma.phoenixPerson.create({
    data: { type, firstName: cleanText(firstName), lastName: cleanText(lastName), email: normalizedEmail, phone: normalizedPhone, normalizedEmail, normalizedPhone, familyId: familyId || undefined, organizationId: organizationId || undefined, birthDate: birthDate || undefined },
  })
}

function suggestMapping(headers: string[]) {
  const mapping: Mapping = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    if (/(prenom|first name|firstname).*(enfant|participant)|(enfant|participant).*(prenom|first name|firstname)/.test(normalized)) mapping.childFirstName = header
    else if (/\b(nom|last name|lastname|surname)\b.*(enfant|participant)|(enfant|participant).*\b(nom|last name|lastname|surname)\b/.test(normalized)) mapping.childLastName = header
    else if (/naissance|age|anniversaire/.test(normalized)) mapping.childBirthDate = header
    else if (/(prenom|first name|firstname).*(parent|contact)|(parent|contact).*(prenom|first name|firstname)/.test(normalized)) mapping.parentFirstName = header
    else if (/\b(nom|last name|lastname|surname)\b.*(parent|contact)|(parent|contact).*\b(nom|last name|lastname|surname)\b|famille/.test(normalized)) mapping.parentLastName = header
    else if (/mail|email|courriel/.test(normalized)) mapping.email = header
    else if (/tel|phone|portable|mobile/.test(normalized)) mapping.phone = header
    else if (/organisation|entreprise|ecole|institution|societe/.test(normalized)) mapping.organizationName = header
    else if (/service|prestation|activite|formule/.test(normalized)) mapping.service = header
    else if (/date/.test(normalized)) mapping.bookingDate = header
    else if (/prix|montant|total|chf/.test(normalized)) mapping.amount = header
    else if (/note|commentaire|remarque/.test(normalized)) mapping.notes = header
  }
  return mapping
}

function normalizeRow(row: Record<string, string>, mapping: Mapping): NormalizedRow {
  const value = (field: string) => cleanText(row[mapping[field]] || "")
  return {
    childFirstName: value("childFirstName"),
    childLastName: value("childLastName"),
    childBirthDate: parseDate(value("childBirthDate")),
    parentFirstName: value("parentFirstName"),
    parentLastName: value("parentLastName"),
    email: normalizeEmail(value("email")),
    phone: normalizePhone(value("phone")),
    organizationName: value("organizationName"),
    service: value("service"),
    bookingDate: parseDate(value("bookingDate")),
    amount: parseAmount(value("amount")),
    notes: value("notes"),
  }
}

function hasUsefulData(row: NormalizedRow) {
  return Boolean(row.childFirstName || row.childLastName || row.email || row.phone || row.organizationName)
}

function normalizeCell(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? "").trim()
}

function makeUniqueHeader(header: string, index: number, allHeaders: string[]) {
  const previousCount = allHeaders.slice(0, index).filter((item) => item === header).length
  return previousCount === 0 ? header : `${header} ${previousCount + 1}`
}

function cleanText(value?: string) {
  return String(value || "").trim().replace(/\s+/g, " ") || undefined
}

function normalizeEmail(value?: string) {
  return cleanText(value)?.toLowerCase()
}

function normalizePhone(value?: string) {
  return cleanText(value)?.replace(/[^0-9+]/g, "")
}

function normalizeHeader(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

function parseDate(value?: string) {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAmount(value?: string) {
  const text = cleanText(value)
  if (!text) return null
  const amount = Number(text.replace(/[^0-9.,-]/g, "").replace(",", "."))
  return Number.isFinite(amount) ? amount : null
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function buildFallbackMessage(targetName: string, serviceName: string, reason: string, channel: string) {
  const greeting = channel === "whatsapp" ? "Bonjour" : `Bonjour ${targetName},`
  return `${greeting}\n\nJe me permets de vous recontacter car ${reason.toLowerCase()}\n\nNous pourrions vous proposer ${serviceName}, avec une formule adaptée à votre situation.\n\nSouhaitez-vous que je vous envoie quelques possibilités ?\n\nSalutations magiques,\nL’Equipe du Centre de Magie de la Côte`
}
