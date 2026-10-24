-- What WelcomeEndToEndTests made in the LOCAL AppTrak (never a real server): the gt-visitor-* requests, and the
-- members their approvals created with those members' grants. Requests are never deleted by the app; only a test does.

DELETE g FROM membership.MemberApplicationRole g JOIN membership.Member m ON m.Id = g.MemberId WHERE m.Identifier LIKE 'gt-visitor-%';
DELETE FROM membership.Member WHERE Identifier LIKE 'gt-visitor-%';
DELETE FROM membership.MembershipRequest WHERE Identifier LIKE 'gt-visitor-%';
