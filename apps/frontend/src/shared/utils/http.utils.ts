export async function parseApiError(response: Response, defaultMessage: string): Promise<Error> {
  try {
    const errorData = await response.json();
    const errorMsg =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData?.message)
          ? errorData.message.join(', ')
          : defaultMessage;
    return new Error(errorMsg);
  } catch {
    return new Error(defaultMessage);
  }
}
