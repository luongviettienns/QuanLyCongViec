/**
 * class-transformer helper: trims strings so that `@MinLength` & co. validate the
 * value that will actually be persisted (otherwise "   " passes MinLength(2)).
 * Non-string values are returned untouched and left to `@IsString` to reject.
 */
export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
