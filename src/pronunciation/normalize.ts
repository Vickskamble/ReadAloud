/**
 * Turns the tokens a speech engine misreads into text it reads correctly.
 *
 * Everything is deterministic and local. A date written as 28/09/2026 is read
 * digit by digit by most engines, and a bare URL is read symbol by symbol;
 * both are replaced here with a form that sounds like a person saying it.
 */

/** Devanagari digits, so numbers can be spelled in the reading language. */
const DEVANAGARI_DIGITS = '०१२३४५६७८९'

const MONTHS: ReadonlyMap<string, string> = new Map([
  ['january', 'January'], ['february', 'February'], ['march', 'March'],
  ['april', 'April'], ['may', 'May'], ['june', 'June'], ['july', 'July'],
  ['august', 'August'], ['september', 'September'], ['october', 'October'],
  ['november', 'November'], ['december', 'December'],
  ['jan', 'January'], ['feb', 'February'], ['mar', 'March'], ['apr', 'April'],
  ['jun', 'June'], ['jul', 'July'], ['aug', 'August'], ['sep', 'September'],
  ['sept', 'September'], ['oct', 'October'], ['nov', 'November'], ['dec', 'December'],
])

const CURRENCY_NAMES: ReadonlyMap<string, string> = new Map([
  ['₹', 'rupees'],
  ['rs', 'rupees'],
  ['rs.', 'rupees'],
  ['$', 'dollars'],
  ['usd', 'dollars'],
  ['€', 'euros'],
  ['eur', 'euros'],
  ['£', 'pounds'],
  ['gbp', 'pounds'],
  ['¥', 'yen'],
  ['jpy', 'yen'],
])

/** Below this, a bare number is read as a plain count. */
const SMALL_NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen',
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** Western grouping: 125,000. Indian grouping is detected separately. */
const WESTERN_GROUP = /\d{1,3}(?:,\d{3})+/

function toDevanagariDigits(value: string): string {
  let out = ''
  for (const char of value) {
    const index = DEVANAGARI_DIGITS.indexOf(char)
    out += index === -1 ? char : DEVANAGARI_DIGITS[index]
  }
  return out
}

/** Reads 0-99 as words. Callers handle hundreds and above. */
function underHundred(value: number): string {
  if (value < 20) return SMALL_NUMBER_WORDS[value]
  const tens = TENS[Math.floor(value / 10)]
  const ones = value % 10
  return ones === 0 ? tens : `${tens}-${SMALL_NUMBER_WORDS[ones]}`
}

function underThousand(value: number): string {
  const hundred = Math.floor(value / 100)
  const rest = value % 100
  const head = hundred === 0 ? '' : `${SMALL_NUMBER_WORDS[hundred]} hundred`
  if (rest === 0) return head
  return head ? `${head} ${underHundred(rest)}` : underHundred(rest)
}

/**
 * Speaks an integer the way it is written, not digit by digit. Indian grouping
 * is respected, so 1,25,000 becomes "one lakh twenty five thousand" rather than
 * the "one two five zero zero zero" an engine would otherwise produce.
 */
export function speakInteger(value: number, language: 'en' | 'hi' = 'en'): string {
  if (!Number.isFinite(value)) return String(value)
  if (value < 0) {
    const magnitude = speakInteger(-value, 'en')
    return language === 'hi' ? toDevanagariWords(`minus ${magnitude}`) : `minus ${magnitude}`
  }
  if (value < 1000) return underThousand(value)

  const digits = String(Math.trunc(value))

  // Indian grouping, so 1,25,000 reads as "one lakh twenty five thousand"
  // rather than the digit-by-digit output an engine produces on its own.
  if (digits.length > 7) {
    const crore = Math.floor(value / 10_000_000)
    const rest = value % 10_000_000
    const head = `${speakInteger(crore, 'en')} crore`
    const tail = rest === 0 ? '' : ` ${speakRemainderUnderCrore(rest)}`
    return language === 'hi' ? toDevanagariWords(head + tail) : head + tail
  }

  if (digits.length > 5) {
    const lakh = Math.floor(value / 100_000)
    const rest = value % 100_000
    const head = `${speakInteger(lakh, 'en')} lakh`
    const tail = rest === 0 ? '' : ` ${speakRemainderUnderCrore(rest)}`
    return language === 'hi' ? toDevanagariWords(head + tail) : head + tail
  }

  const head = `${underThousand(Math.floor(value / 1000))} thousand`
  const tail = value % 1000 === 0 ? '' : ` ${underThousand(value % 1000)}`
  return language === 'hi' ? toDevanagariWords(head + tail) : head + tail
}

function speakRemainderUnderCrore(value: number): string {
  const lakh = Math.floor(value / 100_000)
  const remainder = value % 100_000
  const parts: string[] = []
  if (lakh > 0) parts.push(`${underThousand(lakh)} lakh`)
  if (remainder >= 1000) {
    parts.push(`${underThousand(Math.floor(remainder / 1000))} thousand`)
    const rest = remainder % 1000
    if (rest > 0) parts.push(underThousand(rest))
  } else if (remainder > 0) {
    parts.push(underThousand(remainder))
  }
  return parts.join(' ')
}

/** Crude Devanagari spelling of English number words, for Hindi readings. */
function toDevanagariWords(english: string): string {
  const map: ReadonlyArray<[RegExp, string]> = [
    [/one lakh/g, 'एक लाख'],
    [/two lakh/g, 'दो लाख'],
    [/three lakh/g, 'तीन लाख'],
    [/four lakh/g, 'चार लाख'],
    [/five lakh/g, 'पांच लाख'],
    [/six lakh/g, 'छह लाख'],
    [/seven lakh/g, 'सात लाख'],
    [/eight lakh/g, 'आठ लाख'],
    [/nine lakh/g, 'नौ लाख'],
    [/ten lakh/g, 'दस लाख'],
    [/\bcrore\b/g, 'करोड़'],
    [/\blakh\b/g, 'लाख'],
    [/\bthousand\b/g, 'हज़ार'],
    [/\bhundred\b/g, 'सौ'],
    [/minus/g, 'माइनस'],
  ]
  let out = english
  for (const [pattern, replacement] of map) out = out.replace(pattern, replacement)
  return out
}

function stripGrouping(value: string): string {
  return value.replace(/,/g, '')
}

/** True when the grouping is Indian style (1,25,000). */
function hasIndianGrouping(value: string): boolean {
  const groups = value.split(',')
  if (groups.length < 3) return false
  if (groups[0].length > 3) return false
  return groups.slice(1).every((group) => group.length === 2)
}

/**
 * Normalises a numeric token for speech. Keeps a bare year or a small count as
 * digits when that reads better, which is the convention for dates and years.
 */
export function normalizeNumber(raw: string, language: 'en' | 'hi' = 'en'): string {
  const text = raw.trim()
  if (!text) return text

  const percentMatch = /^([\d.,]+)\s*%$/.exec(text)
  if (percentMatch) {
    const value = Number(stripGrouping(percentMatch[1]))
    if (Number.isFinite(value)) {
      return `${speakInteger(value, language)} percent`
    }
  }

  // Year-like: keep digits, they read naturally as a year.
  if (/^\d{4}$/.test(text) && Number(text) >= 1100 && Number(text) <= 2999) {
    return language === 'hi' ? toDevanagariDigits(text) : text
  }

  if (hasIndianGrouping(text) || WESTERN_GROUP.test(text)) {
    const digits = stripGrouping(text)
    if (digits.length > 3) return speakInteger(Number(digits), language)
  }

  const value = Number(stripGrouping(text))
  if (!Number.isFinite(value)) return text

  // Small numbers read better as words; long digit strings do not.
  if (value <= 999_999 && !/^0\d/.test(text)) {
    return speakInteger(value, language)
  }
  return language === 'hi' ? toDevanagariDigits(digitsOf(value)) : digitsOf(value)
}

function digitsOf(value: number): string {
  return String(value)
}

/** `₹5,000` becomes `five thousand rupees`. */
export function normalizeCurrency(raw: string, language: 'en' | 'hi' = 'en'): string {
  const match = /^([₹$€£¥]|\b(?:rs\.?|usd|eur|gbp|jpy)\b)\s*([\d.,]+)\s*$/i.exec(raw.trim())
  if (!match) return raw

  const symbol = match[1].toLowerCase()
  const name = CURRENCY_NAMES.get(symbol) ?? CURRENCY_NAMES.get(match[1]) ?? ''
  const digits = stripGrouping(match[2])
  const value = Number(digits)
  if (!name || !Number.isFinite(value)) return raw

  const amount = speakInteger(value, language)
  return language === 'hi' ? `${toDevanagariWords(amount)} ${name}` : `${amount} ${name}`
}

/** `5 PM`, `5:30 pm` become words an engine can say naturally. */
export function normalizeTime(raw: string): string {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(raw.trim())
  if (!match) return raw

  const hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3].toLowerCase() === 'a' ? 'am' : 'pm'
  if (hour > 23 || minute > 59) return raw

  const minuteWords = minute === 0 ? "o'clock" : underHundred(minute)
  return `${hour} ${minuteWords} ${meridiem}`
}

const MONTH_NAMES = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec'

/** `28/09/2026` and `28 September 2026` both become a readable date. */
export function normalizeDate(raw: string): string {
  const text = raw.trim()

  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const year = Number(numeric[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return text
    const fullYear = year < 100 ? 2000 + year : year
    return `${day} ${new Date(Date.UTC(fullYear, month - 1, 1)).toLocaleString('en', { month: 'long' })} ${fullYear}`
  }

  const dayFirst = new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})\\.?\\s+(\\d{4})$`, 'i').exec(text)
  if (dayFirst) {
    const month = MONTHS.get(dayFirst[2].toLowerCase())
    if (month) return `${dayFirst[1]} ${month} ${dayFirst[3]}`
  }

  const monthFirst = new RegExp(`^(${MONTH_NAMES})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i').exec(text)
  if (monthFirst) {
    const month = MONTHS.get(monthFirst[1].toLowerCase())
    if (month) return `${month} ${monthFirst[2]}, ${monthFirst[3]}`
  }

  return text
}

/** Spells an address instead of letting the engine say "at" and "dot". */
export function normalizeEmail(raw: string): string {
  const text = raw.replace(/^mailto:/i, '').trim()
  const match = /^([^\s@]+)@([^\s@]+)$/.exec(text)
  if (!match) return raw

  const user = match[1]
  const domain = match[2]
  // Top-level domains are said as words; a subdomain label is spelled out so
  // something like "smtp.brilliants.in" is unambiguous when read aloud.
  const knownTld = new Set(['com', 'in', 'org', 'net', 'co', 'io', 'dev', 'edu', 'gov'])
  const spelledDomain = domain
    .split('.')
    .map((part, index, all) => {
      const isTld = index === all.length - 1
      if (isTld && knownTld.has(part.toLowerCase())) return part.toLowerCase()
      return part
    })
    .join(' dot ')

  // The local part is spelled out: "contact" read as a word is easy to
  // mishear, whereas "c o n t a c t" is unambiguous.
  return `${user.split('').join(' ')} at ${spelledDomain}`
}

/**
 * Reads a URL by its name rather than by its symbols. The scheme is dropped
 * because nobody says "h t t p s colon slash slash" when reading a message.
 */
export function normalizeUrl(raw: string): string {
  const text = raw.trim()
  const withoutScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const withoutPath = withoutScheme.split(/[/?#]/)[0]
  const withoutPort = withoutPath.replace(/:\d+$/, '')

  const parts = withoutPort.split('.').filter(Boolean)
  if (parts.length === 0) return text

  // "brilliants.in" reads as "brilliants dot in".
  return parts.map((part) => (part === 'in' || part === 'com' ? part : part)).join(' dot ')
}

// The variation selector, joiner and regional-indicator ranges complete an
// emoji grapheme cluster, so they are matched in the same pass as the symbol.
const EMOJI_PATTERN =
  // eslint-disable-next-line no-misleading-character-class -- intentional: completes an emoji cluster
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu

/** Emoji are dropped, never read aloud by name. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '')
}

export { toDevanagariDigits }
