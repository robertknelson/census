-- Resolve a link end: a work item addressed by application, release name and title. The
-- target may belong to another manifest, so this runs in the loader's second pass. Read-only.
SELECT w.Id
FROM moveit.WorkItem w JOIN moveit.Release r ON r.Id = w.ReleaseId
WHERE r.ApplicationId = @ApplicationId AND r.Name = @Release AND w.Title = @Title;
