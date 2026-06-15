// ISO 3166-1 alpha-2 → country name, for surfacing an account's destination
// ("This account is in Germany"). Covers all IBAN countries plus the major
// economies that appear in SWIFT/BIC codes; unknown codes fall back to the
// raw code so we never assert something we don't know.
const COUNTRY_NAMES: Record<string, string> = {
  AD: 'Andorra', AE: 'the United Arab Emirates', AF: 'Afghanistan', AL: 'Albania',
  AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
  AZ: 'Azerbaijan', BA: 'Bosnia and Herzegovina', BD: 'Bangladesh', BE: 'Belgium',
  BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BR: 'Brazil', BY: 'Belarus',
  CA: 'Canada', CH: 'Switzerland', CL: 'Chile', CN: 'China', CO: 'Colombia',
  CR: 'Costa Rica', CY: 'Cyprus', CZ: 'the Czech Republic', DE: 'Germany',
  DJ: 'Djibouti', DK: 'Denmark', DO: 'the Dominican Republic', DZ: 'Algeria',
  EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt', ES: 'Spain', ET: 'Ethiopia',
  FI: 'Finland', FK: 'the Falkland Islands', FO: 'the Faroe Islands', FR: 'France',
  GB: 'the United Kingdom', GE: 'Georgia', GI: 'Gibraltar', GL: 'Greenland',
  GR: 'Greece', GT: 'Guatemala', HK: 'Hong Kong', HN: 'Honduras', HR: 'Croatia',
  HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India',
  IQ: 'Iraq', IR: 'Iran', IS: 'Iceland', IT: 'Italy', JO: 'Jordan', JP: 'Japan',
  KE: 'Kenya', KR: 'South Korea', KW: 'Kuwait', KZ: 'Kazakhstan', LB: 'Lebanon',
  LC: 'Saint Lucia', LI: 'Liechtenstein', LK: 'Sri Lanka', LT: 'Lithuania',
  LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MC: 'Monaco',
  MD: 'Moldova', ME: 'Montenegro', MK: 'North Macedonia', MN: 'Mongolia',
  MR: 'Mauritania', MT: 'Malta', MU: 'Mauritius', MX: 'Mexico', MY: 'Malaysia',
  NG: 'Nigeria', NI: 'Nicaragua', NL: 'the Netherlands', NO: 'Norway', NP: 'Nepal',
  NZ: 'New Zealand', OM: 'Oman', PA: 'Panama', PE: 'Peru', PH: 'the Philippines',
  PK: 'Pakistan', PL: 'Poland', PS: 'Palestine', PT: 'Portugal', QA: 'Qatar',
  RO: 'Romania', RS: 'Serbia', RU: 'Russia', SA: 'Saudi Arabia', SC: 'Seychelles',
  SD: 'Sudan', SE: 'Sweden', SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia',
  SM: 'San Marino', SO: 'Somalia', ST: 'Sao Tome and Principe', SV: 'El Salvador',
  TH: 'Thailand', TL: 'Timor-Leste', TN: 'Tunisia', TR: 'Turkey', TW: 'Taiwan',
  UA: 'Ukraine', US: 'the United States', UY: 'Uruguay', VA: 'the Vatican',
  VE: 'Venezuela', VG: 'the British Virgin Islands', VN: 'Vietnam', XK: 'Kosovo',
  ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? `country code ${code.toUpperCase()}`
}
