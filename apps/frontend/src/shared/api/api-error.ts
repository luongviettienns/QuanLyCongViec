export class ApiError extends Error {
  readonly status: number;
  readonly data?: unknown;

  constructor(message: string, status = 500, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export async function parseApiError(
  response: Response,
  defaultMessage: string,
): Promise<ApiError> {
  try {
    const errorData = await response.json();
    const errorMsg =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData?.message)
          ? errorData.message.join(', ')
          : defaultMessage;
    return new ApiError(errorMsg, response.status, errorData);
  } catch {
    return new ApiError(defaultMessage, response.status);
  }
}
