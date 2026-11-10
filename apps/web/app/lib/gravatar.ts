import { Md5 } from "ts-md5";

export function gravatarUrl(email: string, size = 64): string {
  const hash = Md5.hashStr(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}
