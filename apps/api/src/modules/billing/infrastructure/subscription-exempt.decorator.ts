import { SetMetadata } from "@nestjs/common";

export const SUBSCRIPTION_EXEMPT_KEY = "subscription_exempt";

/**
 * Marque un contrôleur/route comme accessible en écriture **même** quand
 * l'organisation est en lecture seule (essai expiré / suspendu). À réserver aux
 * flux qui doivent rester ouverts pour réactiver (billing) ou gérer la session
 * et l'organisation (auth).
 */
export const SubscriptionExempt = () => SetMetadata(SUBSCRIPTION_EXEMPT_KEY, true);
