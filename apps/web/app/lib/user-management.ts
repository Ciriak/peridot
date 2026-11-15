const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

export function managedPasswordPairValid(
  password: string,
  confirmation: string,
  required: boolean,
): boolean {
  if (!password) return !required;
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    confirmation.length > 0 &&
    password === confirmation
  );
}

export function managedPasswordConfirmationMismatch(
  password: string,
  confirmation: string,
): boolean {
  return confirmation.length > 0 && password !== confirmation;
}
