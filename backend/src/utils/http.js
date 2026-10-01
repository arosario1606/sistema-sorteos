export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} inválido`);
  return n;
}
