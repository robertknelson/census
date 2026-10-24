-- How many requests to join are waiting: the count beside Membership in the sidebar (gatehouse.md §11.6, V6). Read-only.

SELECT COUNT(*) AS [Count] FROM membership.MembershipRequest WHERE Status = 'pending';
