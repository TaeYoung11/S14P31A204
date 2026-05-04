export const invitationQueryKeys = {
  userSearch: (keyword: string) => ['users', 'search', keyword] as const,
  notifications: (isRead?: boolean) => ['notifications', 'invitations', isRead] as const,
}
