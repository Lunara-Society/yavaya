# Reglas y números de Yavaya

Valores por defecto de las reglas de negocio, tal como están en el código. Operaciones puede ajustar algunos sin publicar una versión nueva, así que para la situación de un miembro concreto (sus tokens, cuántas publicaciones gratis le quedan) vale lo que devuelve la herramienta my_account. Los montos de dinero están en centavos de dólar (499 = $4.99). Los tiempos van en segundos, minutos, horas o días según el nombre del campo.

## TOKEN_RULES
```json
{
  "starterGrantPerDay": 2,
  "starterGrantDays": 7,
  "starterGrantMaximum": 14
}
```

## TOKEN_PACKAGES
```json
[
  {
    "key": "tokens_2",
    "tokens": 2,
    "priceMinor": 99,
    "currency": "USD"
  },
  {
    "key": "tokens_10",
    "tokens": 10,
    "priceMinor": 449,
    "currency": "USD"
  },
  {
    "key": "tokens_25",
    "tokens": 25,
    "priceMinor": 999,
    "currency": "USD"
  },
  {
    "key": "tokens_50",
    "tokens": 50,
    "priceMinor": 1899,
    "currency": "USD"
  },
  {
    "key": "tokens_100",
    "tokens": 100,
    "priceMinor": 3499,
    "currency": "USD"
  },
  {
    "key": "tokens_500",
    "tokens": 500,
    "priceMinor": 14999,
    "currency": "USD"
  }
]
```

## REPUTATION_RULES
```json
{
  "initialScore": 500,
  "minimumScore": 0,
  "maximumScore": 1000
}
```

## REPUTATION_RULE_DEFAULTS
```json
[
  {
    "key": "email_verified",
    "delta": 20,
    "maxPerDay": 1
  },
  {
    "key": "phone_verified",
    "delta": 50,
    "maxPerDay": 1
  },
  {
    "key": "identity_verified",
    "delta": 100,
    "maxPerDay": 1
  },
  {
    "key": "successful_transaction",
    "delta": 20,
    "maxPerDay": 20
  },
  {
    "key": "successful_delivery",
    "delta": 20,
    "maxPerDay": 30
  },
  {
    "key": "verified_positive_review",
    "delta": 10,
    "maxPerDay": 20
  },
  {
    "key": "approved_cause",
    "delta": 30,
    "maxPerDay": 5
  },
  {
    "key": "approved_animal_adoption",
    "delta": 50,
    "maxPerDay": 5
  },
  {
    "key": "warning_issued",
    "delta": -100,
    "maxPerDay": null
  },
  {
    "key": "confirmed_fraudulent_listing",
    "delta": -250,
    "maxPerDay": null
  }
]
```

## TRUST_BANDS
```json
[
  {
    "key": "restricted",
    "minScore": 0,
    "label": "restricted"
  },
  {
    "key": "new",
    "minScore": 400,
    "label": "new"
  },
  {
    "key": "established",
    "minScore": 600,
    "label": "established"
  },
  {
    "key": "trusted",
    "minScore": 800,
    "label": "trusted"
  }
]
```

## SESSION_RULES
```json
{
  "idleTimeoutMinutes": 120,
  "absoluteTimeoutDays": 30
}
```

## SANCTION_RULES
```json
{
  "suspensionDays": [
    1,
    7,
    30
  ],
  "appealWindowDays": 14,
  "appealMinLength": 20,
  "appealMaxLength": 1500,
  "responseMaxLength": 1000
}
```

## VERIFICATION_RULES
```json
{
  "emailCodeTtlMinutes": 30,
  "passwordResetTtlMinutes": 30,
  "phoneCodeTtlMinutes": 10
}
```

## MEDIA_RULES
```json
{
  "maxUploadBytes": 8388608
}
```

## MERCADITO_RULES
```json
{
  "newSellerWindowDays": 7,
  "newSellerMaxListings": 3,
  "restrictedCategoriesForUnverified": [],
  "minPhotos": 1,
  "maxPhotos": 6,
  "titleMinLength": 4,
  "titleMaxLength": 90,
  "descriptionMinLength": 10,
  "descriptionMaxLength": 4000,
  "maxPriceMinor": 1000000000,
  "maxSavedSearches": 20,
  "freeOpenListings": 5,
  "featureDays": 7
}
```

## REFERRAL_RULES
```json
{
  "inviterReward": 3,
  "inviteeReward": 2,
  "maxRewardedPerMonth": 10
}
```

## COMMUNITY_RULES
```json
{
  "titleMinLength": 4,
  "titleMaxLength": 100,
  "bodyMinLength": 10,
  "bodyMaxLength": 3000,
  "replyMinLength": 2,
  "replyMaxLength": 1500
}
```

## WORK_RULES
```json
{
  "titleMinLength": 5,
  "titleMaxLength": 100,
  "descriptionMinLength": 40,
  "descriptionMaxLength": 4000,
  "requirementsMaxLength": 2000,
  "payMinLength": 3,
  "payMaxLength": 80,
  "companyMaxLength": 100,
  "headlineMinLength": 5,
  "headlineMaxLength": 100,
  "aboutMinLength": 30,
  "aboutMaxLength": 2000,
  "skillsMaxLength": 500,
  "messageMinLength": 20,
  "messageMaxLength": 2000,
  "maxFieldsPerProfile": 3,
  "maxPortfolioLinks": 3,
  "maxOpenPostsPerEmployer": 10,
  "maxOpenApplicationsPerCandidate": 20,
  "employerNameMinLength": 3,
  "employerNameMaxLength": 100,
  "registrationMaxLength": 40,
  "employerAboutMinLength": 30,
  "employerAboutMaxLength": 1000,
  "postOpenDays": 30,
  "freeOpenPosts": 2,
  "featureDays": 7
}
```

## SAFE_SPACE_RULES
```json
{
  "messageMaxLength": 2000,
  "reportNoteMaxLength": 1000,
  "roomRetentionDays": 30,
  "threadRetentionDays": 90,
  "reportRetentionDays": 90,
  "newThreadsPerDay": 10
}
```

## ANIMALS_RULES
```json
{
  "quizPassMark": 8,
  "nameMaxLength": 60,
  "descriptionMinLength": 30,
  "descriptionMaxLength": 3000,
  "notesMaxLength": 1000,
  "rescuerNameMinLength": 3,
  "rescuerNameMaxLength": 120,
  "rescuerAboutMinLength": 40,
  "rescuerAboutMaxLength": 2000,
  "answerMinLength": 2,
  "answerMaxLength": 1000,
  "minPhotos": 1,
  "maxPhotos": 6,
  "maxOpenApplicationsPerMember": 3,
  "maxActiveListingsPerRescuer": 40,
  "lostMinPhotos": 1,
  "lostMaxPhotos": 4,
  "lostDescriptionMinLength": 20,
  "lostDescriptionMaxLength": 1500,
  "lostMaxOpenPerMember": 5,
  "lostOpenDays": 60,
  "lostSeenDaysBack": 90
}
```

## SERVICES_RULES
```json
{
  "titleMinLength": 5,
  "titleMaxLength": 100,
  "bodyMinLength": 20,
  "bodyMaxLength": 2000,
  "messageMinLength": 10,
  "messageMaxLength": 1000,
  "priceMaxLength": 60,
  "headlineMinLength": 5,
  "headlineMaxLength": 80,
  "bioMinLength": 20,
  "bioMaxLength": 1000,
  "licenceMinLength": 5,
  "licenceMaxLength": 200,
  "reviewMaxLength": 1000,
  "maxCategoriesPerProvider": 3,
  "maxOpenRequestsPerMember": 5,
  "maxResponsesPerRequest": 20,
  "availableTodayHours": 12,
  "positiveReviewStars": 4
}
```

## SANCTUARY_RULES
```json
{
  "nameMinLength": 3,
  "nameMaxLength": 120,
  "denominationMaxLength": 80,
  "descriptionMinLength": 20,
  "descriptionMaxLength": 2000,
  "addressMaxLength": 200,
  "maxChurchesPerOwner": 3,
  "maxServicesPerChurch": 20,
  "serviceTitleMaxLength": 60,
  "devotionalTitleMinLength": 3,
  "devotionalTitleMaxLength": 120,
  "scriptureMaxLength": 80,
  "devotionalBodyMinLength": 20,
  "devotionalBodyMaxLength": 4000,
  "maxDevotionalsPerChurchPerDay": 3,
  "devotionalDaysAhead": 14,
  "devotionalDaysBack": 1,
  "feedSize": 12,
  "wordDeliveryLocalHour": 6,
  "dailyLightLocalHour": 8
}
```

## GO_RULES
```json
{
  "storeAnswerMinutes": 15,
  "pickupWaitMinutes": 45,
  "maxLinesPerOrder": 30,
  "maxQuantityPerLine": 20,
  "maxOpenOrdersPerCustomer": 2,
  "maxDeliveryKm": 15,
  "menuMaxItems": 200,
  "maxPhotos": 1,
  "featureDays": 7
}
```

## GO_PLAN_RULES
```json
{
  "freeOrdersPerMonth": 30,
  "planPriceUsdCents": 1900,
  "foundingCutoff": "2027-03-31",
  "foundingMonths": 12
}
```

## GO_TRIP_RULES
```json
{
  "offerWindowMinutes": 20,
  "maxActivePerCustomer": 1,
  "maxDistanceKm": 60,
  "maxEtaMinutes": 120,
  "maxPassengers": 4,
  "descriptionMaxLength": 500
}
```
