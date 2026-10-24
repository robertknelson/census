-- What AppEventsEndToEndTests made in the LOCAL logs database (never a real server): the access-request events of the
-- gt-* test identities. The demo events (Data's "demo": true) are left alone.

DELETE FROM apptrak.AppEvent
WHERE Namespace = N'membership' AND CommandName = N'access-request' AND Identifier LIKE N'gt-%';
