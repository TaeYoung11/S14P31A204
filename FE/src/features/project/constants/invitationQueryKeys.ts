export const invitationQueryKeys = {
  all: ['notifications', 'invitations'] as const,
  userSearch: (keyword: string) => ['users', 'search', keyword] as const,
  notifications: (isRead?: boolean) => ['notifications', 'invitations', isRead] as const,
}
