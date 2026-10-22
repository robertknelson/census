-- The application registry (personas.md §3; move-it.md open item 10). Census's own row is in
-- it; the persona code tells it apart by the Personas:EstateApplication setting.
-- Read-only.

SELECT Id AS ApplicationId, Identifier, Name
FROM membership.Application
ORDER BY Name, Id;
