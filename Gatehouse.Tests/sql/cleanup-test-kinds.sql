-- What AppEventKindsEndToEndTests made in the LOCAL AppTrak (never a real server): the gt-test-* kinds and their
-- history. The app never deletes a kind; only a test does.

DELETE a FROM membership.MembershipAudit a
JOIN membership.AppEventKind k ON a.Entity = 'app-event-kind' AND a.EntityKey = CAST(k.AppEventKindId AS nvarchar(100))
WHERE k.Namespace LIKE 'gt-test%';
DELETE FROM membership.AppEventKind WHERE Namespace LIKE 'gt-test%';
