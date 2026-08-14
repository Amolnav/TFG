interface ApiErrorPayload {
  code?: string;
  type?: string;
  message?: string;
}

interface I18nLike {
  exists?: (key: string) => boolean;
}

type TFunction = (key: string) => string;

/**
 * M5: traduce una respuesta de error de la API por su código estable
 * (payload.code o payload.type → clave i18n "api.codes.<CODE>").
 * El message del backend queda solo como fallback de depuración, y la clave
 * genérica indicada como último recurso.
 */
export function translateApiError(
  error: unknown,
  fallbackKey: string,
  t: TFunction,
  i18n: I18nLike
): string {
  const axiosErr = error as { response?: { data?: ApiErrorPayload } } | undefined;
  const payload = axiosErr?.response?.data;
  const code = payload?.code || payload?.type;

  if (code && i18n?.exists?.(`api.codes.${code}`)) {
    return t(`api.codes.${code}`);
  }
  if (payload?.message) {
    return payload.message;
  }
  return t(fallbackKey);
}

/**
 * M5: igual que translateApiError pero para payloads de disponibilidad que
 * llegan con 200 y { code, message } en data.
 */
export function translateApiCode(
  code: string | null | undefined,
  message: string | null | undefined,
  fallbackKey: string,
  t: TFunction,
  i18n: I18nLike
): string {
  if (code && i18n?.exists?.(`api.codes.${code}`)) {
    return t(`api.codes.${code}`);
  }
  return message || t(fallbackKey);
}
