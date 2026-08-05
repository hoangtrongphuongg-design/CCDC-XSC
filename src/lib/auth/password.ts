import bcrypt from "bcryptjs";

const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8G8B6oaOKAoJ.iyRHqE9ImxeUXNMLW";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash?: string | null) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}
