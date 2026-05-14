import path from "node:path"
import * as XLSX from "xlsx"
import { prisma, disconnectPrisma } from "../src/lib/prisma"
import { ensurePhoenixServices, generateOpportunities } from "../src/services/phoenix-crm.service"

const files = {
  courses: "/Users/laurentmoreschi/Library/CloudStorage/GoogleDrive-magielacote@gmail.com/Mon Drive/1.1 CMC Shared/CMC - Inscriptions Elèves.xlsx",
  stages: "/Users/laurentmoreschi/Library/CloudStorage/GoogleDrive-magielacote@gmail.com/Mon Drive/1.1 CMC Shared/CMC - Inscriptions Stages et Animations.xlsx",
  animations: "/Users/laurentmoreschi/Library/CloudStorage/GoogleDrive-magielacote@gmail.com/Mon Drive/1.1 CMC Shared/CMC - Animations.xlsx",
}

type Matrix = string[][]
type ImportStats = {
  source: string
  scannedRows: number
  imported: number
  duplicates: number
  skipped: number
}

type BookingInput = {
  serviceCode: string
  sourceType: string
  sourceLabel: string
  bookingDate?: Date | null
  amount?: number | null
  notes?: string
  child?: PersonInput
  parent?: PersonInput
  family?: FamilyInput
  organization?: OrganizationInput
}

type PersonInput = {
  type: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: string
  birthDate?: Date | null
  magicLevel?: string
  notes?: string
}

type FamilyInput = {
  name?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
}

type OrganizationInput = {
  name: string
  email?: string
  phone?: string
  address?: string
  type?: string
  notes?: string
}

const dryRun = process.argv.includes("--dry-run")

async function main() {
  await ensurePhoenixServices()

  const stats = [
    await importCourses(),
    await importStagesAndEvents(),
    await importAnimations(),
  ]

  if (!dryRun) {
    await generateOpportunities()
  }

  console.table(stats)
}

async function importCourses(): Promise<ImportStats> {
  const source = "Cours collectifs"
  const workbook = XLSX.readFile(files.courses, { cellDates: true })
  const sheets = workbook.SheetNames.filter((sheetName) => /^\d{4}-\d{4}$/.test(sheetName))
  const inputs: BookingInput[] = []

  for (const sheetName of sheets) {
    const yearStart = Number(sheetName.slice(0, 4))
    const matrix = readSheet(workbook, sheetName)
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex]
      if (!isCourseHeader(row)) continue

      const context = matrix[rowIndex - 1] || []
      const day = clean(context[1])
      const time = clean(context[2])
      const courseTitle = clean(context[4]) || "Cours collectif"
      const instructor = clean(context[7])
      const indexes = indexHeaders(row)

      for (let itemIndex = rowIndex + 1; itemIndex < matrix.length; itemIndex += 1) {
        const item = matrix[itemIndex]
        if (isCourseHeader(item) || looksLikeCourseContext(item)) break

        const firstName = valueAt(item, indexes["prenom"])
        const lastName = valueAt(item, indexes["nom"])
        if (!firstName && !lastName) continue

        const parentName = valueAt(item, indexes["nom parent"])
        const email = firstEmail(valueAt(item, indexes["e mail"]))
        const phone = firstPhone(valueAt(item, indexes["no natel"]) || valueAt(item, indexes["no telephone"]))
        const address = valueAt(item, indexes["adresse"])
        const magicLevel = valueAt(item, indexes["niveau"])
        const notes = [
          valueAt(item, indexes["remarques"]),
          valueAt(item, indexes["nom de scene"]) ? `Nom de scène: ${valueAt(item, indexes["nom de scene"])}` : "",
          valueAt(item, indexes["date d entree"]) ? `Entrée: ${valueAt(item, indexes["date d entree"])}` : "",
          instructor ? `Prof: ${instructor}` : "",
        ].filter(Boolean).join(" · ")

        inputs.push({
          serviceCode: "COURS_COLLECTIF_ENFANT",
          sourceType: "cours_collectifs",
          sourceLabel: `${sheetName} · ${day} ${time} · ${courseTitle}`.trim(),
          bookingDate: new Date(yearStart, 8, 1),
          amount: parseAmount(valueAt(item, indexes["paiement"])),
          notes,
          family: {
            name: lastName ? `Famille ${toTitle(lastName)}` : parentName ? `Famille ${parentName}` : undefined,
            email,
            phone,
            address,
          },
          child: {
            type: "CHILD",
            firstName,
            lastName,
            email,
            phone,
            address,
            birthDate: parseDate(valueAt(item, indexes["date de naissance"])),
            magicLevel,
            notes,
          },
          parent: parentName ? {
            type: "PARENT",
            firstName: parentName,
            lastName,
            email,
            phone,
            address,
          } : undefined,
        })
      }
    }
  }

  return persistBatch(source, "cours_collectifs_cmc", files.courses, inputs)
}

async function importStagesAndEvents(): Promise<ImportStats> {
  const source = "Stages et événements"
  const workbook = XLSX.readFile(files.stages, { cellDates: true })
  const sheets = workbook.SheetNames.filter((sheetName) => /^\d{4}$/.test(sheetName))
  const inputs: BookingInput[] = []

  for (const sheetName of sheets) {
    const year = Number(sheetName)
    const matrix = readSheet(workbook, sheetName)
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex]
      if (!isStageHeader(row)) continue

      const titleRow = matrix[rowIndex - 2] || []
      const detailRow = matrix[rowIndex - 1] || []
      const eventTitle = clean(titleRow[1]) || clean(titleRow[0]) || "Stage ou événement"
      const eventDateLabel = clean(detailRow[1])
      const location = clean(titleRow[3]) || clean(detailRow[3])
      const staff = clean(detailRow[3]) || clean(detailRow[6])
      const defaultPrice = parseAmount(detailRow.find((cell) => clean(cell)?.includes("CHF")) || "")
      const indexes = indexHeaders(row)

      for (let itemIndex = rowIndex + 1; itemIndex < matrix.length; itemIndex += 1) {
        const item = matrix[itemIndex]
        if (isStageHeader(item) || looksLikeStageContext(item)) break

        const firstName = valueAt(item, indexes["prenom"])
        const lastName = valueAt(item, indexes["nom"])
        const email = firstEmail(valueAt(item, indexes["email"]))
        const phone = firstPhone(valueAt(item, indexes["tel"]))
        const address = valueAt(item, indexes["adresse"])
        if (!firstName && !lastName && !email && !phone) continue

        const notes = [
          eventDateLabel ? `Dates: ${eventDateLabel}` : "",
          location ? `Lieu: ${location}` : "",
          staff ? `Equipe: ${staff}` : "",
          valueAt(item, indexes["internet"]) ? `Internet: ${valueAt(item, indexes["internet"])}` : "",
          valueAt(item, indexes["paye"]) ? `Payé: ${valueAt(item, indexes["paye"])}` : "",
          valueAt(item, indexes["solde"]) ? `Solde: ${valueAt(item, indexes["solde"])}` : "",
          valueAt(item, indexes["divers"]) || valueAt(item, indexes["duree stage"]),
        ].filter(Boolean).join(" · ")

        inputs.push({
          serviceCode: serviceCodeForStage(eventTitle),
          sourceType: "stages_evenements",
          sourceLabel: `${sheetName} · ${eventTitle}`,
          bookingDate: parseFrenchDate(eventDateLabel, year) || new Date(year, 0, 1),
          amount: parseAmount(valueAt(item, indexes["prix"])) || defaultPrice,
          notes,
          family: {
            name: lastName ? `Famille ${toTitle(lastName)}` : undefined,
            email,
            phone,
            address,
          },
          child: {
            type: "CHILD",
            firstName,
            lastName,
            email,
            phone,
            address,
            notes,
          },
        })
      }
    }
  }

  return persistBatch(source, "stages_evenements_cmc", files.stages, inputs)
}

async function importAnimations(): Promise<ImportStats> {
  const source = "Animations externes"
  const workbook = XLSX.readFile(files.animations, { cellDates: true })
  const sheets = workbook.SheetNames.filter((sheetName) => /^Animations? \d{4}$/.test(sheetName))
  const inputs: BookingInput[] = []

  for (const sheetName of sheets) {
    const year = Number(sheetName.match(/\d{4}/)?.[0] || "")
    const matrix = readSheet(workbook, sheetName)
    const headerIndex = matrix.findIndex((row) => indexHeaders(row)["annee"] !== undefined && indexHeaders(row)["date"] !== undefined && indexHeaders(row)["client"] !== undefined)
    if (headerIndex === -1) continue

    const indexes = indexHeaders(matrix[headerIndex])
    for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex]
      const client = valueAt(row, indexes["client"])
      const description = valueAt(row, indexes["description"])
      const contact = valueAt(row, indexes["coordonnees client"])
      const type = valueAt(row, indexes["type"])
      if (!client && !description && !contact) continue

      const email = firstEmail(contact)
      const phone = firstPhone(contact)
      const address = valueAt(row, indexes["adresse client"])
      const dateLabel = valueAt(row, indexes["date"])
      const bookingDate = parseFrenchDate(dateLabel, year) || new Date(year, 0, 1)
      const serviceCode = serviceCodeForAnimation(type, description)
      const isBirthday = serviceCode === "ANNIVERSAIRE_MAGIQUE"
      const notes = [
        valueAt(row, indexes["heure"]) ? `Heure: ${valueAt(row, indexes["heure"])}` : "",
        type ? `Type: ${type}` : "",
        description,
        valueAt(row, indexes["duree"]) ? `Durée: ${valueAt(row, indexes["duree"])}` : "",
        valueAt(row, indexes["lieu"]) ? `Lieu: ${valueAt(row, indexes["lieu"])}` : "",
        valueAt(row, indexes["magicien 1"]) ? `Magicien: ${valueAt(row, indexes["magicien 1"])}` : "",
        valueAt(row, indexes["divers"]),
      ].filter(Boolean).join(" · ")

      inputs.push({
        serviceCode,
        sourceType: "animations_externes",
        sourceLabel: `${sheetName} · ${type || "Animation"} · ${client || description}`,
        bookingDate,
        amount: parseAmount(valueAt(row, indexes["prix client"])),
        notes,
        family: isBirthday ? {
          name: client ? `Famille ${client}` : undefined,
          email,
          phone,
          address,
        } : undefined,
        parent: isBirthday ? {
          type: "PARENT",
          firstName: client,
          email,
          phone,
          address,
        } : undefined,
        organization: isBirthday ? undefined : {
          name: client || description || "Organisation sans nom",
          email,
          phone,
          address,
          type: type || "Animation externe",
          notes,
        },
      })
    }
  }

  return persistBatch(source, "animations_externes_cmc", files.animations, inputs)
}

async function persistBatch(source: string, importType: string, filename: string, inputs: BookingInput[]): Promise<ImportStats> {
  const stats: ImportStats = { source, scannedRows: inputs.length, imported: 0, duplicates: 0, skipped: 0 }
  if (dryRun) return stats

  const batch = await prisma.phoenixImportBatch.create({
    data: {
      filename: path.basename(filename),
      importType,
      status: "IMPORTED",
      rawRows: inputs.map((input) => ({
        serviceCode: input.serviceCode,
        sourceType: input.sourceType,
        sourceLabel: input.sourceLabel,
        bookingDate: input.bookingDate?.toISOString() || null,
      })),
      rowCount: inputs.length,
    },
  })

  for (const input of inputs) {
    const imported = await persistBooking(input, batch.id)
    if (imported === "imported") stats.imported += 1
    else if (imported === "duplicate") stats.duplicates += 1
    else stats.skipped += 1
  }

  await prisma.phoenixImportBatch.update({
    where: { id: batch.id },
    data: {
      importedCount: stats.imported,
      duplicateCount: stats.duplicates,
    },
  })

  return stats
}

async function persistBooking(input: BookingInput, importBatchId: string) {
  const service = await prisma.phoenixService.findUnique({ where: { code: input.serviceCode } })
  if (!service) return "skipped"

  const family = input.family ? await findOrCreateFamily(input.family) : null
  const organization = input.organization ? await findOrCreateOrganization(input.organization) : null
  const child = input.child ? await findOrCreatePerson(input.child, family?.id, null) : null
  const parent = input.parent ? await findOrCreatePerson(input.parent, family?.id, organization?.id) : null

  const existing = await prisma.phoenixBooking.findFirst({
    where: {
      serviceId: service.id,
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      bookingDate: input.bookingDate || null,
      childId: child?.id || null,
      organizationId: organization?.id || null,
    },
  })

  if (existing) return "duplicate"

  await prisma.phoenixBooking.create({
    data: {
      serviceId: service.id,
      childId: child?.id,
      parentId: parent?.id,
      familyId: family?.id,
      organizationId: organization?.id,
      importBatchId,
      bookingDate: input.bookingDate || undefined,
      amount: input.amount || undefined,
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      notes: input.notes,
    },
  })

  return "imported"
}

async function findOrCreateFamily(input: FamilyInput) {
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  const existing = email ? await prisma.phoenixFamily.findFirst({ where: { email } }) : null
  if (existing) {
    return prisma.phoenixFamily.update({
      where: { id: existing.id },
      data: {
        phone: existing.phone || phone,
        address: existing.address || clean(input.address),
      },
    })
  }

  return prisma.phoenixFamily.create({
    data: {
      name: input.name || (email ? `Famille ${email}` : "Famille sans nom"),
      email,
      phone,
      address: clean(input.address),
      notes: clean(input.notes),
    },
  })
}

async function findOrCreateOrganization(input: OrganizationInput) {
  const email = normalizeEmail(input.email)
  const existing = await prisma.phoenixOrganization.findFirst({
    where: {
      OR: [
        email ? { email } : undefined,
        { name: { equals: input.name, mode: "insensitive" } },
      ].filter(Boolean) as any,
    },
  })
  if (existing) {
    return prisma.phoenixOrganization.update({
      where: { id: existing.id },
      data: {
        email: existing.email || email,
        phone: existing.phone || normalizePhone(input.phone),
        address: existing.address || clean(input.address),
        type: existing.type || clean(input.type),
      },
    })
  }

  return prisma.phoenixOrganization.create({
    data: {
      name: clean(input.name) || "Organisation sans nom",
      email,
      phone: normalizePhone(input.phone),
      address: clean(input.address),
      type: clean(input.type),
      notes: clean(input.notes),
    },
  })
}

async function findOrCreatePerson(input: PersonInput, familyId?: string | null, organizationId?: string | null) {
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  const where = [
    email ? { normalizedEmail: email, type: input.type } : undefined,
    phone ? { normalizedPhone: phone, type: input.type } : undefined,
    input.firstName || input.lastName ? {
      type: input.type,
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      familyId: familyId || undefined,
    } : undefined,
  ].filter(Boolean) as any[]
  const existing = where.length ? await prisma.phoenixPerson.findFirst({ where: { OR: where } }) : null

  if (existing) {
    return prisma.phoenixPerson.update({
      where: { id: existing.id },
      data: {
        email: existing.email || email,
        phone: existing.phone || phone,
        address: existing.address || clean(input.address),
        magicLevel: existing.magicLevel || clean(input.magicLevel),
        familyId: existing.familyId || familyId || undefined,
        organizationId: existing.organizationId || organizationId || undefined,
      },
    })
  }

  return prisma.phoenixPerson.create({
    data: {
      type: input.type,
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      email,
      phone,
      address: clean(input.address),
      magicLevel: clean(input.magicLevel),
      birthDate: input.birthDate || undefined,
      normalizedEmail: email,
      normalizedPhone: phone,
      familyId: familyId || undefined,
      organizationId: organizationId || undefined,
      notes: clean(input.notes),
    },
  })
}

function readSheet(workbook: XLSX.WorkBook, sheetName: string): Matrix {
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false })
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
}

function isCourseHeader(row: string[]) {
  const headers = row.map(normalizeHeader)
  return headers.includes("nom") && headers.includes("prenom") && headers.includes("nom parent")
}

function isStageHeader(row: string[]) {
  const headers = row.map(normalizeHeader)
  return headers.includes("prenom") && headers.includes("nom") && headers.some((header) => header === "email" || header === "e mail")
}

function looksLikeCourseContext(row: string[]) {
  return Boolean(clean(row[1]) && clean(row[2]) && row.some((cell) => /magie|cours|magic team/i.test(cell)))
}

function looksLikeStageContext(row: string[]) {
  return row.some((cell) => /stage|atelier|ecole|poudlard|sorciers|grimoire|halloween/i.test(cell)) && row.filter((cell) => clean(cell)).length <= 5
}

function indexHeaders(row: string[]) {
  const entries = row.map((header, index) => [normalizeHeader(header), index] as const).filter(([header]) => header)
  return Object.fromEntries(entries)
}

function valueAt(row: string[], index?: number) {
  return index === undefined ? "" : clean(row[index]) || ""
}

function serviceCodeForStage(title: string) {
  const text = normalizeHeader(title)
  if (text.includes("halloween")) return "STAGE_HALLOWEEN"
  if (text.includes("paques") || text.includes("printemps")) return "STAGE_PAQUES"
  const summerMatch = text.match(/ete\s*([1-5])/)
  if (summerMatch) return `STAGE_ETE_${summerMatch[1]}`
  if (text.includes("sorcier")) return "ESCAPE_SORCIERS"
  if (text.includes("pierre")) return "ESCAPE_PIERRE"
  return "STAGE_ETE_1"
}

function serviceCodeForAnimation(type: string, description: string) {
  const text = normalizeHeader(`${type} ${description}`)
  if (text.includes("anniversaire")) return "ANNIVERSAIRE_MAGIQUE"
  if (text.includes("pierre philosophale")) return "ESCAPE_PIERRE"
  if (text.includes("sorcier") || text.includes("escape")) return "ESCAPE_SORCIERS"
  return "ANIMATION_INSTITUTIONNELLE"
}

function parseFrenchDate(value: string, fallbackYear: number) {
  const text = normalizeHeader(value)
  const monthByName: Record<string, number> = {
    janvier: 0,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
  }
  const monthName = Object.keys(monthByName).find((month) => text.includes(month))
  const dayMatch = text.match(/\b(\d{1,2})(?:er)?\b/)
  if (!monthName || !dayMatch) return null
  return new Date(fallbackYear, monthByName[monthName], Number(dayMatch[1]))
}

function parseDate(value: string) {
  const text = clean(value)
  if (!text) return null
  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/)
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
    return new Date(year, Number(slash[2]) - 1, Number(slash[1]))
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAmount(value: unknown) {
  const text = clean(String(value ?? ""))
  if (!text) return null
  const match = text.replace("'", "").match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  return Number(match[0].replace(",", "."))
}

function firstEmail(value: string) {
  return clean(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0])
}

function firstPhone(value: string) {
  const match = value.match(/(?:\+41|0)\s?\d[\d\s/.-]{6,}/)
  return match ? normalizePhone(match[0]) : undefined
}

function normalizeEmail(value?: string) {
  return clean(value)?.toLowerCase()
}

function normalizePhone(value?: string) {
  return clean(value)?.replace(/[^0-9+]/g, "")
}

function normalizeHeader(value: string) {
  return clean(value)?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() || ""
}

function clean(value?: string) {
  return String(value || "").trim().replace(/\s+/g, " ") || undefined
}

function toTitle(value: string) {
  return value.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
