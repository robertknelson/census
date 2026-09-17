-- Fix a title in place (move-it.md §16). The row's identity on the page is its Id; a manifest
-- keyed by the old title will report the item as an orphan, which is the loader saying so.
UPDATE moveit.WorkItem SET Title = @Title WHERE Id = @Id AND Title <> @Title;
SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'renamed' ELSE 'unchanged' END AS Outcome;
