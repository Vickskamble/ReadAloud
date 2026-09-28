/**
 * Local pronunciation dictionaries.
 *
 * Everything here is offline data. The sets are intentionally plain and easy to
 * extend: adding a word is a one-line change, and no rebuild of any kind of
 * model is involved.
 */

/** Roman-script Hindi words, so Hinglish is not mistaken for English. */
export const HINGLISH_WORDS: ReadonlySet<string> = new Set([
  'aaj', 'kal', 'abhi', 'ab', 'mujhe', 'mujhse', 'mujhko', 'tum', 'tumhe', 'tumko',
  'tumhara', 'tumhari', 'mera', 'meri', 'mere', 'hamara', 'hamari', 'hum', 'aap',
  'aapko', 'aapka', 'aapki', 'kya', 'kyu', 'kyon', 'kaise', 'kab', 'kahan', 'kaha',
  'hai', 'hain', 'tha', 'thi', 'hoga', 'hogi', 'honge', 'kar', 'karo',
  'karna', 'karte', 'kiya', 'kiye', 'ja', 'jao', 'jana', 'jaana', 'aana', 'aao',
  'aaya', 'aaye', 'gaya', 'gayi', 'gaye', 'raha', 'rahi', 'rahe', 'chahiye',
  'nahi', 'nahin', 'haan', 'han', 'acha', 'achha', 'bahut', 'thoda', 'zyada',
  'phir', 'lekin', 'aur', 'ya', 'bhi', 'se', 'ko', 'ka', 'ki', 'ke', 'mein', 'me',
  'par', 'pe', 'liye', 'dena', 'diya', 'di', 'lo', 'lena', 'bolo', 'batao',
  'samajh', 'samjha', 'samjho', 'dikhao', 'bhejo', 'bhejna', 'rakhna', 'nikalna',
  'chalo', 'chalo', 'shukriya', 'dhanyavad', 'namaste', 'jaldi', 'abhi', 'jaldi',
  'waqt', 'kaam', 'karna', 'karte', 'chalo', 'shuru', 'ruk', 'rukna',
  'aage', 'peeche', 'upar', 'neeche', 'andar', 'bahar', 'ghar', 'reply',
  'jana', 'dena', 'lena', 'marna', 'karega', 'karenge',
  'milenge', 'dekhna', 'dekh', 'sunna', 'bolna', 'bol', 'padhna', 'padho',
  'likhna', 'likho', 'khatam', 'shuru', 'ruk', 'sab', 'kuch', 'sirf',
])

/**
 * English and technical vocabulary. Used to stop a technical term from being
 * transliterated into Hindi just because it sits inside a Hinglish sentence.
 */
export const ENGLISH_WORDS: ReadonlySet<string> = new Set([
  'office', 'the', 'to', 'a', 'i', 'of', 'and', 'in', 'is', 'it', 'you', 'we', 'they', 'for', 'on', 'with', 'that', 'this', 'at', 'be', 'was', 'were', 'are', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'as', 'by', 'from', 'but', 'or', 'so', 'not', 'my', 'your', 'our', 'their', 'do', 'does', 'did', 'me', 'time', 'confirm', 'reply', 'sun', 'thanks', 'please', 'send', 'today', 'tomorrow', 'yesterday',  'to', 'a', 'i', 'of', 'and', 'in', 'is', 'it', 'you', 'we', 'they', 'for', 'on', 'with', 'that', 'this', 'at', 'be', 'was', 'were', 'are', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'as', 'by', 'from', 'but', 'or', 'so', 'not', 'my', 'your', 'our', 'their', 'does', 'did', 'thanks', 'please', 'send', 'today', 'tomorrow', 'yesterday',  'meeting', 'project', 'software', 'company', 'mobile', 'phone',
  'computer', 'website', 'email', 'message', 'call', 'video', 'file', 'report',
  'system', 'app', 'application', 'login', 'password', 'dashboard', 'download',
  'upload', 'internet', 'online', 'offline', 'server', 'database', 'account',
  'profile', 'user', 'admin', 'employee', 'manager', 'client', 'customer',
  'business', 'payment', 'invoice', 'billing', 'energy', 'maintenance',
  'automation', 'hardware', 'network', 'printer', 'scanner', 'laptop',
  'desktop', 'printer', 'backup', 'update', 'upgrade', 'install', 'support',
  'training', 'policy', 'process', 'quality', 'team', 'manager', 'client',
  'status', 'request', 'response', 'meeting', 'agenda', 'minutes', 'invoice',
  'payment', 'receipt', 'expense', 'salary', 'interview', 'resume', 'notice',
])

/** Terms that are read as words rather than spelled out. */
export const TECHNICAL_WORDS: ReadonlySet<string> = new Set([
  'erp', 'crm', 'saas', 'iot', 'api', 'hrms', 'mvp', 'dashboard', 'automation',
  'software', 'hardware', 'database', 'server', 'router', 'switch', 'firewall',
  'kubernetes', 'docker', 'python', 'java', 'javascript', 'excel', 'outlook',
])

/**
 * Devanagari words that are Marathi rather than Hindi. Hindi and Marathi share
 * a script, so the only reliable local signal is the vocabulary itself.
 */
export const MARATHI_WORDS: ReadonlySet<string> = new Set([
  'आहे', 'आहेत', 'आहो', 'मला', 'तुला', 'आम्हाला', 'आम्ही', 'तुम्ही', 'तुम्हाला',
  'जायचे', 'जायची', 'करायचे', 'करायची', 'येणार', 'नाही', 'नको', 'आणि', 'पण',
  'म्हणून', 'म्हणजे', 'काय', 'का', 'कुठे', 'कधी', 'साठी', 'बरोबर', 'नंतर', 'आता',
  'उद्या', 'आज', 'काल', 'मी', 'तू', 'त्या', 'याचा', 'याची', 'त्याचा', 'त्याची',
  'काही', 'सगळे', 'खूप', 'फक्त', 'सुद्धा', 'असे', 'म्हणूनच', 'इथे', 'तिथे',
  'आपले', 'तुमचे', 'माझे', 'त्यामुळे', 'नंतरच', 'आधी', 'खाली', 'वर', 'बाजूला',
])

/**
 * Marathi-only Devanagari letters. A single one of these is enough to identify
 * a word as Marathi: ळ and ऱ do not exist in standard Hindi.
 */
export const MARATHI_LETTERS = /[ळऱ]/

/** Abbreviations and how they should be read aloud. */
export const ABBREVIATIONS: ReadonlyMap<string, string> = new Map([
  ['ceo', 'chief executive officer'],
  ['cfo', 'chief financial officer'],
  ['cto', 'chief technology officer'],
  ['coo', 'chief operating officer'],
  ['hr', 'h r'],
  ['erp', 'e r p'],
  ['crm', 'c r m'],
  ['api', 'a p i'],
  ['gst', 'g s t'],
  ['pf', 'p f'],
  ['tds', 't d s'],
  ['hrms', 'h r m s'],
  ['mvp', 'm v p'],
  ['saas', 'saas'],
  ['iot', 'internet of things'],
  ['ai', 'a i'],
  ['it', 'i t'],
  ['pvt', 'private limited'],
  ['ltd', 'limited'],
  ['llp', 'limited liability partnership'],
  ['usa', 'u s a'],
  ['uk', 'u k'],
])

/** Abbreviations that are read as ordinary words rather than spelled out. */
export const WORD_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'saas',
  'faq',
  'asap',
  'ok',
  'diy',
  'faq',
])

/**
 * User pronunciation overrides, the highest-priority rule in the pipeline.
 * Maps what the user typed to what should be spoken. This holds pronunciation
 * only, never message text.
 */
const USER_PRONUNCIATIONS = new Map<string, string>([
  ['brilliants', 'Brilliants'],
  ['powerems', 'Power EMS'],
  ['ironbook', 'Iron Book'],
])

export function getUserPronunciation(word: string): string | undefined {
  return USER_PRONUNCIATIONS.get(word.toLowerCase())
}

export function setUserPronunciation(word: string, spoken: string): void {
  USER_PRONUNCIATIONS.set(word.toLowerCase(), spoken)
}

export function clearUserPronunciations(): void {
  USER_PRONUNCIATIONS.clear()
}
