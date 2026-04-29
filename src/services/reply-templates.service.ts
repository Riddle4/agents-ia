import type { RequestType } from "./request-classifier.service"

type TemplateInput = {
  firstName?: string | null
  availabilityText?: string | null
}

export function getBusinessTemplate(type: RequestType, input: TemplateInput) {
  const name = input.firstName ? ` ${input.firstName}` : ""

  switch (type) {
    case "ANNIVERSAIRE":
      return `
Bonjour${name},

Nous vous remercions pour votre message et pour l’intérêt porté à notre Univers magique.

Nous serions ravis d’organiser l’anniversaire de votre enfant au Centre de Magie de la Côte à Nyon.

Nous proposons plusieurs formules d’anniversaire, notamment autour de la magie, de Harry Potter ou de nos Escape Games L’École des Sorciers et La Pierre Philosophale.

Vous trouverez l’ensemble de nos formules d’anniversaire sur notre site internet :
www.magie-lacote.com/anniversaires

Toujours indiquer dans la réponse :
"Vous trouverez en pièce jointe le formulaire de réservation à nous retourner complété."

Concernant les disponibilités, utilisez uniquement les créneaux fournis dans le contexte IA.

Si plusieurs options sont possibles, guidez le client selon l’âge de l’enfant :
- enfant de 4 à 6 ans : recommander un anniversaire Magic Kids
- enfant entre 7 et 8 ans : recommander plutôt un anniversaire magique
- dès 8 ans : magie, escape game ou formule combinée possible

Toujours préciser que le message ne constitue pas une réservation.
`.trim()

    case "TEAM_BUILDING":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Nous proposons pour les entreprises un atelier de magie spécialement conçu pour les team buildings, alliant convivialité, collaboration et découverte.

Informations de base :
- Atelier de magie en groupe
- Durée : 1 heure
- Tarif : CHF 40.– par personne
- Lieu : Centre de Magie de la Côte, à Nyon

L’expérience peut être adaptée selon les besoins du client : durée, format ou objectifs spécifiques.
`.trim()

    case "ANIMATION_EXTERNE":
      return `
Bonjour${name},

Nous vous remercions pour votre message et pour l’intérêt porté à nos animations.

Avant de proposer une offre, demandez les informations manquantes :
- type d’animation souhaitée : close-up, spectacle, atelier
- lieu de l’événement
- durée souhaitée
- nombre de personnes attendu
- présence d’une scène si spectacle
- matériel son disponible : micro, sono
- budget approximatif si possible

Ne pas inventer de prix.
Ne pas proposer un magicien précis sans information suffisante.
`.trim()

    case "STAGE":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Le Centre de Magie de la Côte propose des stages de magie pendant les vacances scolaires :
- Pâques
- été
- automne / Halloween

Si le client souhaite inscrire un enfant, répondre chaleureusement et mentionner le formulaire d’inscription au stage correspondant.
`.trim()

    case "COURS_COLLECTIF":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Nous proposons des cours collectifs de magie pour enfants dès 7 ans, pour tous niveaux, à Genève, Nyon, Morges et Martigny.

Si le client demande une inscription, mentionner le formulaire d’inscription aux cours collectifs pour l’année scolaire en cours.
`.trim()

    case "ESCAPE_GAME":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Nous proposons deux Escape Games à Nyon :
- L’École des Sorciers
- La Pierre Philosophale

Adapter la réponse selon que la demande concerne une réservation, un anniversaire ou une simple information.
`.trim()

    case "SOIREE_MAGIQUE_PRIVEE":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Nous proposons des Soirées Magiques Privées pour adultes ou familles, avec privatisation de nos locaux, accueil, apéritif et spectacle exclusif dans notre petit théâtre.

Mentionner le formulaire de réservation d’une Soirée Magique Privée si le client souhaite avancer.
`.trim()

case "ANIMATION_DOMICILE_SIMPLE":
  return `
Bonjour,

Nous vous remercions pour votre message.

Pour une animation de magie à domicile d’environ 1 heure, il faut compter CHF 450.-.

Toujours mentionner :
"Vous trouverez en pièce jointe notre formulaire avec toutes les informations détaillées."

Rester simple, direct et professionnel.
`.trim()

    case "BOUTIQUE":
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Notre boutique de magie à Nyon est ouverte sur rendez-vous.

Inviter le client à proposer un moment de passage ou à préciser ce qu’il recherche.
`.trim()

    default:
      return `
Bonjour${name},

Nous vous remercions pour votre message.

Répondre de manière chaleureuse, claire et professionnelle. Si la demande est incomplète, poser une question simple pour pouvoir orienter correctement le client.
`.trim()
  }
}