import { processIncomingEmail } from '../workflows/email.workflow'
import type { IncomingEmail } from '../services/message.service'
import { getAvailableSlots } from '../services/availability.service'
import { extractDateRangeFromText } from '../services/date-extractor.service'
import { analyzeEmail } from '../services/email-analysis.service'

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

  let emailAnalysis = await analyzeEmail({
    fromEmail: email.fromEmail,
    subject: email.subject,
    body: email.body,
  })

  if (emailAnalysis.shouldCheckCalendar && emailAnalysis.replyMode === 'ANSWER_AND_CLOSE') {
    emailAnalysis = {
      ...emailAnalysis,
      replyMode: 'ANSWER_AND_ASK',
      reasoningSummary: `${emailAnalysis.reasoningSummary} Mode de réponse ajusté car des disponibilités doivent être proposées au client.`,
    }
  }

  console.log('\n🧠 Analyse email')
  console.log(`Type : ${emailAnalysis.requestType}`)
  console.log(`Lieu : ${emailAnalysis.locationType ?? 'non déterminé'}`)
  console.log(`Mode réponse : ${emailAnalysis.replyMode}`)
  console.log(`Calendrier : ${emailAnalysis.shouldCheckCalendar ? 'oui' : 'non'}`)

  let availableSlots: any[] = []
  let availabilityText: string | null = null
  let availabilityError: string | null = null

  if (emailAnalysis.shouldCheckCalendar) {
    console.log('\n📅 Vérification calendrier autorisée pour cet anniversaire sur place')

    try {
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
    } catch (error) {
      availabilityError = error instanceof Error ? error.message : 'Erreur calendrier inconnue'

      emailAnalysis = {
        ...emailAnalysis,
        replyMode: 'ESCALATE_TO_HUMAN',
        missingHumanInfo: [
          ...emailAnalysis.missingHumanInfo,
          'Vérification Google Calendar impossible',
        ],
        humanQuestion:
          'Le calendrier Google est inaccessible. Peux-tu vérifier les disponibilités manuellement avant validation ?',
        reasoningSummary: `${emailAnalysis.reasoningSummary} La vérification calendrier a échoué : ${availabilityError}.`,
      }

      console.log(`⚠️ Vérification calendrier impossible : ${availabilityError}`)
    }
  } else {
    console.log('\n📅 Pas de vérification calendrier pour cette demande')
  }

  const enrichedEmail = {
    ...email,
    aiContext: {
      needsAvailability: emailAnalysis.shouldCheckCalendar,
      availableSlots,
      availabilityText,
      availabilityError,
      emailAnalysis,
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
    needsAvailability: emailAnalysis.shouldCheckCalendar,
    availableSlotsCount: availableSlots.length,
    analysis: emailAnalysis,
  }
}
