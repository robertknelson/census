-- Release a build claim (move-it.md §29, his 19): the (ReleaseId, Build) row goes. The caller
-- records the act as a build-released event in the same transaction, so the record keeps
-- what the loader's "never deleted here" rule (build-upsert) protects. Work items whose
-- IncludedInBuild is this build are left alone: the location rule (01) answers from the
-- claims that remain, which is the honest consequence. A claim already gone is 'unchanged'.
DELETE FROM moveit.ReleaseBuild WHERE ReleaseId = @ReleaseId AND Build = @Build;
SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'released' ELSE 'unchanged' END AS Outcome;
