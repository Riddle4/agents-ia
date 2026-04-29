import { processIncomingEmail } from '../workflows/email.workflow'
import type { IncomingEmail } from '../services/message.service'
import { getAvailableSlots } from '../services/availability.service'
import { extractDateRangeFromText } from '../services/date-extractor.service'

function needsAvailability(email: IncomingEmail) {
  const text = `
    ${email.subject ?? ''}
    ${email.body ?? ''}
  `.toLowerCase()

  const keywords = [
    'disponible',
    'disponibilité',
    'disponibilités',
    'date',
    'dates',
    'créneau',
    'créneaux',
    'horaire',
    'horaires',
    'réserver',
    'réservation',
    'anniversaire',
    'place',
    'places',
  ]

  return keywords.some((keyword) => text.includes(keyword))
}

function getDateRangeForAvailability() {
  const start = new Date()
  const end = new Date()

  end.setDate(end.getDate() + 90)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function formatSlotsForAI(slots: any[]) {
  if (!slots || slots.length === 0) {
    return 'Aucun créneau disponible trouvé sur la période analysée.'
  }

  return slots
  .map((slot) => {
    return `- ${slot.weekday} ${slot.date} de ${slot.start} à ${slot.end}`
  })
  .join('\n')
}

export async function runEmailAgent(email: IncomingEmail) {
  console.log('\n🤖 EmailAgent démarré')
  console.log(`Email reçu de : ${email.fromEmail}`)
  console.log(`Sujet : ${email.subject}`)

  let availableSlots: any[] = []
  let availabilityText: string | null = null

  if (needsAvailability(email)) {
    console.log('\n📅 Demande de disponibilité détectée')

    const extracted = await extractDateRangeFromText(email.body)

let start: string
let end: string

if (extracted?.startDate && extracted?.endDate) {
  start = extracted.startDate
  end = extracted.endDate

  console.log("📆 Période détectée :", start, "→", end)
} else {
  const fallback = getDateRangeForAvailability()
  start = fallback.start
  end = fallback.end
}

    availableSlots = await getAvailableSlots(start, end)
    availabilityText = formatSlotsForAI(availableSlots)

    console.log('Créneaux disponibles trouvés :')
    console.log(availabilityText)
  } else {
    console.log('\n📅 Pas de demande de disponibilité détectée')
  }

  const enrichedEmail = {
    ...email,
    aiContext: {
      needsAvailability: needsAvailability(email),
      availableSlots,
      availabilityText,
    },
  }

  const result = await processIncomingEmail(enrichedEmail)

  console.log('\n✅ EmailAgent terminé')
  console.log(`Client : ${result.customerAction}`)
  console.log(`Message enregistré : ${result.message.id}`)
  console.log(`Tâche : ${result.taskAction}`)

  return {
    agent: 'EmailAgent',
    status: 'SUCCESS',
    customerId: result.customer.id,
    messageId: result.message.id,
    taskId: result.task?.id ?? null,
    customerAction: result.customerAction,
    taskAction: result.taskAction,
    needsAvailability: needsAvailability(email),
    availableSlotsCount: availableSlots.length,
  }
}