import "server-only";

const EXPECTED_API_VERSION = "1";

export function hasExpectedApiVersion(response: Response): boolean {
  return response.headers.get("x-elova-api-version") === EXPECTED_API_VERSION;
}
