import { prisma } from '../lib/prisma'

function extractNamesFromEmail(email: string) {
  const localPart = email.split('@')[0] || ''
  const clean = localPart.replace(/[0-9]/g, '')
  const parts = clean.split(/[._-]+/).filter(Boolean)

  const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()

  if (parts.length === 0) {
    return { firstName: null, lastName: null }
  }

  if (parts.length === 1) {
    return { firstName: capitalize(parts[0]), lastName: null }
  }

  return {
    firstName: capitalize(parts[0]),
    lastName: capitalize(parts.slice(1).join(' ')),
  }
}

export async function findOrCreateCustomer(email: string, tx = prisma) {
  let customer = await tx.customer.findUnique({
    where: { email },
  })

  let action: 'CREATED' | 'REUSED' = 'REUSED'

  if (!customer) {
    const names = extractNamesFromEmail(email)

    customer = await tx.customer.create({
      data: {
        email,
        firstName: names.firstName,
        lastName: names.lastName,
        phone: null,
        tags: ['email-inbound'],
      },
    })

    action = 'CREATED'
  }

  return { customer, action }
}