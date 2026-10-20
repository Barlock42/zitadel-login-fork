/** Separate canary login sessions from the production login on the same host. */
export function loginCookieName(name: string): string {
  return `${process.env.LOGIN_COOKIE_PREFIX ?? ""}${name}`;
}

export function loginCookiePath(): string {
  return process.env.LOGIN_COOKIE_PREFIX ? process.env.NEXT_PUBLIC_BASE_PATH || "/" : "/";
}
