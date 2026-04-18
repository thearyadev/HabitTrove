type TranslationValues = Record<string, unknown>

type TranslationFunction = {
  (key: string, values?: Record<string, any>): string
  has?: (key: string) => boolean
}

export function translateWithFallback(
  t: TranslationFunction,
  key: string,
  fallback: string,
  values?: TranslationValues
) {
  if (typeof t.has === 'function' && t.has(key)) {
    return t(key, values)
  }

  if (!values) {
    return fallback
  }

  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replaceAll(`{${token}}`, String(value ?? ''))
  }, fallback)
}
