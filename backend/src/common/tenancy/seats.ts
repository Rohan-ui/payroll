/**
 * Which memberships occupy a seat. Active and suspended members keep their
 * place in the workspace; removed members (ARCHIVED) and their history do
 * not count. The workspace's own settings page, the platform directories and
 * the Command Centre all read this, so they cannot disagree.
 */
export const SEAT_MEMBERSHIP_STATUSES: readonly string[] = ['ACTIVE', 'SUSPENDED'];
