// Readable staff numbers by role (TECH-001, MGR-001, CEO-001), given in the order people were added.
// A number never changes once given, unless the person moves to another role (they then get the next
// number for the new role).
import { STAFF_CODE_PREFIX, User } from './stecsecure-types';
import { nextDocNumber } from './numbering';

const fitsRole = (u: User) => Boolean(u.staffCode && u.staffCode.startsWith(STAFF_CODE_PREFIX[u.role]));

// Returns the same array (and the same objects) when everyone already has a number
export function withStaffCodes(users: User[]): User[] {
  if (users.every(fitsRole)) return users;
  const codes = users.map((u) => (fitsRole(u) ? u.staffCode : undefined));
  return users.map((u, i) => {
    if (codes[i]) return u;
    const staffCode = nextDocNumber(STAFF_CODE_PREFIX[u.role], codes);
    codes[i] = staffCode;
    return { ...u, staffCode };
  });
}
