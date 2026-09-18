import { ROLE_LABEL } from '../lib/permissions.js';

export default function RoleChip({ role }) {
  return <span className={`role-chip role-${role}`}>{ROLE_LABEL[role]}</span>;
}
