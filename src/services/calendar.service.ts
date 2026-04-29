import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

export function getGoogleAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost"
  )
}

export async function getBusySlots(start: string, end: string) {
  const auth = getGoogleAuthClient()

  // Temporaire : on ajoutera le token juste après
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN manquant")
  }

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  const calendar = google.calendar({ version: "v3", auth })

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      timeZone: "Europe/Zurich",
      items: [
        {
          id: process.env.GOOGLE_CALENDAR_ID!,
        },
      ],
    },
  })

  return response.data.calendars?.[process.env.GOOGLE_CALENDAR_ID!]?.busy ?? []
}