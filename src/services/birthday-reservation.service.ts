import OpenAI from "openai"
import { DateTime } from "luxon"
import { createCalendarEvent } from "./calendar.service"

let openai: OpenAI | null = null

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return openai
}

export type UploadedReservationFile = {
  name: string
  mimeType: string
  dataUrl: string
}

export type BirthdayReservationAnalysis = {
  variantName: string | null
  customerPhone: string | null
  childFirstName: string | null
  childAge: string | null
  childrenCount: number | null
  eventDate: string | null
  startTime: string | null
  endTime: string | null
  basePrice: number | null
  options: {
    name: string
    unitPrice: number | null
    quantity: number | null
    total: number | null
  }[]
  totalPrice: number | null
  priceCalculation: string
  summary: string
  confirmationDraft: string
  warnings: string[]
  extractionDetails: {
    selectedVariantEvidence: string | null
    selectedOptionsEvidence: string[]
    childrenCountEvidence: string | null
  }
}

type ExtractedBirthdayReservation = {
  variantName: string | null
  customerPhone: string | null
  childFirstName: string | null
  childAge: string | null
  childrenCount: number | null
  eventDate: string | null
  startTime: string | null
  endTime: string | null
  basePrice: number | null
  selectedVariantEvidence: string | null
  options: {
    name: string
    checked: boolean
    pricingType: "FIXED" | "PER_CHILD" | "UNKNOWN"
    unitPrice: number | null
    evidence: string | null
  }[]
  childrenCountEvidence: string | null
  warnings: string[]
}

type AddBirthdayEventInput = {
  title: string
  summary: string
  eventDate: string
  startTime: string
  endTime: string
}

function parseJSON(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)

    if (!match) {
      return null
    }

    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function fileToContent(file: UploadedReservationFile) {
  if (file.mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: file.name,
      file_data: file.dataUrl.replace(/^data:application\/pdf;base64,/, ""),
    }
  }

  return {
    type: "input_image",
    image_url: file.dataUrl,
    detail: "high",
  }
}

function normalizeExtraction(raw: any): ExtractedBirthdayReservation {
  const options = Array.isArray(raw?.options)
    ? raw.options.map((option: any) => ({
        name: typeof option?.name === "string" ? option.name : "Option non identifiée",
        checked: option?.checked === true,
        pricingType:
          option?.pricingType === "FIXED" || option?.pricingType === "PER_CHILD"
            ? option.pricingType
            : "UNKNOWN",
        unitPrice: typeof option?.unitPrice === "number" ? option.unitPrice : null,
        evidence: typeof option?.evidence === "string" ? option.evidence : null,
      }))
    : []

  return {
    variantName: typeof raw?.variantName === "string" ? raw.variantName : null,
    customerPhone: typeof raw?.customerPhone === "string" ? raw.customerPhone : null,
    childFirstName: typeof raw?.childFirstName === "string" ? raw.childFirstName : null,
    childAge: typeof raw?.childAge === "string" ? raw.childAge : null,
    childrenCount: typeof raw?.childrenCount === "number" ? raw.childrenCount : null,
    eventDate: typeof raw?.eventDate === "string" ? raw.eventDate : null,
    startTime: typeof raw?.startTime === "string" ? raw.startTime : null,
    endTime: typeof raw?.endTime === "string" ? raw.endTime : null,
    basePrice: typeof raw?.basePrice === "number" ? raw.basePrice : null,
    selectedVariantEvidence:
      typeof raw?.selectedVariantEvidence === "string" ? raw.selectedVariantEvidence : null,
    options,
    childrenCountEvidence:
      typeof raw?.childrenCountEvidence === "string" ? raw.childrenCountEvidence : null,
    warnings: Array.isArray(raw?.warnings)
      ? raw.warnings.filter((warning: unknown): warning is string => typeof warning === "string")
      : [],
  }
}

function isPerChildOption(name: string, pricingType: ExtractedBirthdayReservation["options"][number]["pricingType"]) {
  const normalized = name.toLowerCase()

  return (
    pricingType === "PER_CHILD" ||
    normalized.includes("goûter") ||
    normalized.includes("gouter") ||
    normalized.includes("cadeau")
  )
}

function calculateReservation(extraction: ExtractedBirthdayReservation): BirthdayReservationAnalysis {
  const warnings = [...extraction.warnings]
  const selectedOptions = extraction.options.filter((option) => option.checked)

  let totalPrice = extraction.basePrice ?? 0
  const calculationParts: string[] = []

  if (extraction.basePrice === null) {
    warnings.push("Prix de base illisible ou non détecté.")
  } else {
    calculationParts.push(`Prix de base ${extraction.variantName ?? "variante inconnue"} : CHF ${extraction.basePrice}.`)
  }

  const calculatedOptions = selectedOptions.map((option) => {
    const perChild = isPerChildOption(option.name, option.pricingType)
    const quantity = perChild ? extraction.childrenCount : 1
    const total =
      typeof option.unitPrice === "number" && typeof quantity === "number"
        ? option.unitPrice * quantity
        : null

    if (option.unitPrice === null) {
      warnings.push(`Prix illisible pour l'option "${option.name}".`)
    }

    if (perChild && extraction.childrenCount === null) {
      warnings.push(`Nombre d'enfants manquant pour calculer l'option "${option.name}".`)
    }

    if (total !== null) {
      totalPrice += total
      calculationParts.push(
        perChild
          ? `${option.name} : CHF ${option.unitPrice} x ${quantity} enfant(s) = CHF ${total}.`
          : `${option.name} : CHF ${total}.`
      )
    }

    return {
      name: option.name,
      unitPrice: option.unitPrice,
      quantity,
      total,
    }
  })

  const optionsText = calculatedOptions.length
    ? calculatedOptions
        .map((option) => {
          if (option.total === null) {
            return `${option.name} (prix à vérifier)`
          }

          if (option.quantity && option.quantity > 1) {
            return `${option.name} CHF ${option.unitPrice} x ${option.quantity} = CHF ${option.total}`
          }

          return `${option.name} CHF ${option.total}`
        })
        .join(", ")
    : "aucune option détectée"

  const priceCalculation = `${calculationParts.join(" ")} Total calculé : CHF ${totalPrice}.`

  const variantName = extraction.variantName ?? "à vérifier"
  const customerPhone = extraction.customerPhone ?? "à vérifier"
  const childFirstName = extraction.childFirstName ?? "à vérifier"
  const childAge = extraction.childAge ?? "à vérifier"
  const childrenCount = extraction.childrenCount ?? "à vérifier"
  const dateText = formatEuropeanDate(extraction.eventDate)
  const timeText = formatTimeRange(extraction.startTime, extraction.endTime)
  const totalText = extraction.basePrice === null ? "à vérifier" : `CHF ${totalPrice}`
  const confirmationDraft = buildConfirmationDraft({
    variantName,
    dateText,
    timeText,
    optionsText,
    childrenCount,
    totalText,
  })

  return {
    variantName: extraction.variantName,
    customerPhone: extraction.customerPhone,
    childFirstName: extraction.childFirstName,
    childAge: extraction.childAge,
    childrenCount: extraction.childrenCount,
    eventDate: extraction.eventDate,
    startTime: extraction.startTime,
    endTime: extraction.endTime,
    basePrice: extraction.basePrice,
    options: calculatedOptions,
    totalPrice,
    priceCalculation,
    summary: `anniversaire ${variantName}, téléphone client ${customerPhone}, enfant ${childFirstName}, âge ${childAge}, options ${optionsText}, nombre d'enfants ${childrenCount}, prix total CHF ${totalPrice} (${priceCalculation})`,
    confirmationDraft,
    warnings,
    extractionDetails: {
      selectedVariantEvidence: extraction.selectedVariantEvidence,
      selectedOptionsEvidence: selectedOptions
        .map((option) => option.evidence)
        .filter((value): value is string => Boolean(value)),
      childrenCountEvidence: extraction.childrenCountEvidence,
    },
  }
}

function buildConfirmationDraft(input: {
  variantName: string
  dateText: string
  timeText: string
  optionsText: string
  childrenCount: string | number
  totalText: string
}) {
  return `
Bonjour,

Nous vous remercions d'avoir choisi le Centre de Magie de la Côte pour l'anniversaire de votre enfant.

✨ Voici la confirmation de réservation de votre anniversaire magique ✨

Variante : ${input.variantName} au Centre de Magie de la Côte
Date : ${input.dateText}
Heure : ${input.timeText}
Options : ${input.optionsText}
Nombre d'enfants max : ${input.childrenCount}
Prix : ${input.totalText}

Vous pouvez télécharger les cartons d’invitation ici :
https://www.magie-lacote.com/cartonsdinvitation

Nous n’avons pas de lecteur de cartes à disposition, nous vous remercions de prévoir un paiement en espèces le jour même. Dans le cas où vous souhaiteriez annuler ou modifier cette réservation sans frais, nous vous remercions de nous en informer par e-mail au plus tard 5 jours avant l’événement.

Pour passer un super moment, voici quelques consignes :

ACCUEIL DES INVITÉS
L’anniversaire commence par une petite animation dans la Boutique de Magie. Pour cette raison, nous vous remercions de réunir tous les enfants et de les faire entrer en même temps à l’heure précise du début de l’anniversaire. Les parents de l’enfant qui a son anniversaire pourront rentrer dans le Centre de Magie environ 5 minutes après, dès la fin de l’animation dans la Boutique.

Un parking P+R est à votre disposition à l’allée de la Petite Prairie, directement à gauche au rond-point en descendant de l’autoroute. Il est gratuit les week-ends.

Un plan Google Maps est disponible ici :
https://www.magie-lacote.com/contact

ANIMATION MAGIQUE
Lors des anniversaires magiques, seuls les enfants peuvent assister à l’animation dans le Petit Théâtre Magique. Les parents peuvent profiter de ce moment pour se reposer dans le Salon Magique avant le goûter 😉. Les apprentis magiciens pourront ainsi garder les secrets des tours enseignés.

À la fin de l’animation magie, vous aurez la possibilité de faire des photos du groupe d’apprentis magiciens dans le Petit Théâtre.

Lors de la représentation, nous utilisons du matériel pyrotechnique. Les effets magiques présentés ne doivent en aucun cas être reproduits à la maison.

GOÛTER - OUVERTURE DES CADEAUX
Nous vous remercions de respecter les interdictions suivantes : nourriture cuisinée (pizza, hot-dogs, hamburgers, grillades, etc.), confettis, bombes, pétards, serpentins et autres objets susceptibles de détériorer les locaux.

Pour le goûter, merci de prévoir la nappe, les services, les verres, les assiettes, le couteau, les bougies, le briquet, ainsi que le gâteau et les boissons.

Les bougies scintillantes sont formellement interdites dans tout le Centre de Magie. Seules les bougies traditionnelles en cire sont autorisées sous la surveillance constante d’un adulte.

Le goûter se passe sous la surveillance des parents, avec au moins un adulte présent. Si vous le souhaitez, vous pouvez choisir l’option surveillance par un animateur ou l’option Goûter Anniversaire inclus, selon les possibilités indiquées dans le formulaire.

Le ménage est inclus dans le prix.

Un espace ouvert est à votre disposition à l’étage pour l’ouverture des cadeaux après le goûter. Si vous choisissez l’option surveillance des enfants la 2ème heure, nos animateurs s’occuperont d’animer l’ouverture des cadeaux dans notre Petit Théâtre Magique.

En cas de beau temps, une aire de jeu est à disposition à côté du Centre de Magie, sous la surveillance des parents.

DÉPART DES INVITÉS
Nous avons souvent des anniversaires qui s’enchaînent, ne soyez pas surpris si vous voyez d'autres enfants ou parents arriver 15 minutes après la fin de votre anniversaire magique.

La Boutique de Magie reste ouverte 15 minutes après la fin de l’anniversaire si vous souhaitez effectuer des achats magiques.

Toute l’équipe vous remercie encore pour votre confiance. Nous nous réjouissons de vous accueillir au Centre de Magie de la Côte 💫

Nous vous transmettons nos salutations les plus magiques et à bientôt !

L'Équipe du Centre de Magie de la Côte
`.trim()
}

function formatEuropeanDate(value: string | null) {
  if (!value) {
    return "à vérifier"
  }

  const date = DateTime.fromISO(value, { zone: "Europe/Zurich" })

  if (!date.isValid) {
    return value
  }

  return date.toFormat("dd/MM/yyyy")
}

function formatTime(value: string | null) {
  if (!value) {
    return null
  }

  const [hour, minute] = value.split(":")

  if (!hour || !minute) {
    return value
  }

  return `${hour}h${minute}`
}

function formatTimeRange(startTime: string | null, endTime: string | null) {
  const start = formatTime(startTime)
  const end = formatTime(endTime)

  if (!start || !end) {
    return "à vérifier"
  }

  return `${start} à ${end}`
}

export async function analyzeBirthdayReservation(files: UploadedReservationFile[]) {
  const client = getOpenAIClient()

  if (!client) {
    throw new Error("OPENAI_API_KEY manquante dans .env")
  }

  if (files.length === 0) {
    throw new Error("Aucun fichier fourni")
  }

  const content = [
    ...files.map(fileToContent),
    {
      type: "input_text",
      text: `
Tu analyses des formulaires de réservation d'un anniversaire magique.

Objectif :
Extraire factuellement les informations remplies par le client. Ne calcule pas le total final : le système le recalculera.

Règles de lecture visuelle :
- Trouve la variante d'anniversaire cochée par le client.
- Le prix de base est le prix situé juste à gauche de la case cochée.
- Pour chaque option, indique si elle est cochée.
- Pour chaque option cochée, lis son prix unitaire.
- Pour les options goûter ou cadeaux magiques, mets pricingType = "PER_CHILD".
- Pour les options au forfait, mets pricingType = "FIXED".
- Le nombre d'enfants se situe généralement à la dernière page.
- Cite dans les champs evidence ce qui te fait penser que la case est cochée.
- Si une case cochée est ambiguë, ajoute une alerte dans warnings.
- Ne sélectionne pas une variante ou option si la coche n'est pas clairement visible.

Retourne uniquement un JSON STRICT :
{
  "variantName": "nom de la variante choisie",
  "selectedVariantEvidence": "description courte de la case cochée et de sa position",
  "customerPhone": "téléphone du client ou parent, avec indicatif si visible",
  "childFirstName": "prénom de l'enfant",
  "childAge": "âge de l'enfant",
  "childrenCount": 12,
  "childrenCountEvidence": "où le nombre d'enfants est lu",
  "eventDate": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endTime": "HH:mm",
  "basePrice": 0,
  "options": [
    {
      "name": "nom option",
      "checked": true,
      "pricingType": "FIXED | PER_CHILD | UNKNOWN",
      "unitPrice": 0,
      "evidence": "description courte de la case cochée"
    }
  ],
  "warnings": []
}
      `.trim(),
    },
  ]

  const response = await client.responses.create({
    model: process.env.BIRTHDAY_ANALYSIS_MODEL || "gpt-5.5",
    input: [
      {
        role: "user",
        content,
      },
    ],
  })

  const parsed = parseJSON(response.output_text || "")

  if (!parsed) {
    throw new Error("Analyse OpenAI illisible")
  }

  return calculateReservation(normalizeExtraction(parsed))
}

export async function addBirthdayReservationToCalendar(input: AddBirthdayEventInput) {
  const date = DateTime.fromISO(input.eventDate, { zone: "Europe/Zurich" })
  const [startHour, startMinute] = input.startTime.split(":").map(Number)
  const [endHour, endMinute] = input.endTime.split(":").map(Number)

  if (!date.isValid || Number.isNaN(startHour) || Number.isNaN(endHour)) {
    throw new Error("Date ou heure invalide")
  }

  const start = date.set({
    hour: startHour,
    minute: startMinute || 0,
    second: 0,
    millisecond: 0,
  })

  const end = date.set({
    hour: endHour,
    minute: endMinute || 0,
    second: 0,
    millisecond: 0,
  })

  return createCalendarEvent({
    summary: input.title,
    description: input.summary,
    start: start.toISO()!,
    end: end.toISO()!,
  })
}
