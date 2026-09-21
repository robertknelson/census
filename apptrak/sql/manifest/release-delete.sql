-- Delete a release and everything asserted under it (move-it.md §16, stabilization only).
-- The one exception to "never delete": while the page is being shaken out, a release entered
-- wrong is removed whole rather than pulled item by item. Cascade by hand (no foreign keys in
-- AppTrak): links touching its items from either side, its events, its build claims, its
-- items, then the release. moveit.Deployment is observed and never touched. The caller runs
-- this inside a transaction. A release already gone is 'unchanged'.
DECLARE @Items TABLE (Id int PRIMARY KEY);
INSERT @Items SELECT Id FROM moveit.WorkItem WHERE ReleaseId = @Id;

DELETE FROM moveit.WorkItemLink
WHERE WorkItemId IN (SELECT Id FROM @Items) OR LinkedWorkItemId IN (SELECT Id FROM @Items);
DECLARE @Links int = @@ROWCOUNT;

DELETE FROM moveit.ReleaseEvent WHERE ReleaseId = @Id;
DECLARE @Events int = @@ROWCOUNT;

DELETE FROM moveit.ReleaseBuild WHERE ReleaseId = @Id;
DECLARE @Builds int = @@ROWCOUNT;

DELETE FROM moveit.WorkItem WHERE ReleaseId = @Id;
DECLARE @WorkItems int = @@ROWCOUNT;

DELETE FROM moveit.Release WHERE Id = @Id;

SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'deleted' ELSE 'unchanged' END AS Outcome,
       @WorkItems AS WorkItems, @Builds AS Builds, @Events AS Events, @Links AS Links;
