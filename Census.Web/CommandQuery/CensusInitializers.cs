using System.Data;

namespace Census.Web.CommandQuery;

// Every Census key, its script under apptrak/sql, the shape it answers, and the parameters it takes (census-on-apptrak.md
// §3). One class per area, as xf-dashboard and Gatehouse register them. A write's Actor and ImpersonatedBy are §10.3's.

// Move It's board and questions (move-it.md §10.2 rule 9: one read-only .sql per question), and the lists.
public class MoveItSqlCommandInitializer : SqlCommandInitializer
{
    public MoveItSqlCommandInitializer()
    {
        foreach (var name in new[] { "stages", "applications", "releases", "history", "events", "release-builds", "release-build-history", "builds-seen", "coverage", "calendar" })
        {
            Script($"board.{name}", $"board/{name}.sql", ResultShape.Rows);
        }
        foreach (var name in new[] { "01-where-is-everything", "02-release-status", "03-order-violations", "04-ready-to-approve", "06-stage-mismatch", "09-lead-time", "12-approval-vs-prod" })
        {
            Script($"question.{name}", $"questions/{name}.sql", ResultShape.Rows);
        }
        Script("question.13-feature-picture", "questions/13-feature-picture.sql", ResultShape.Json);
        Script("moveit.lists", "manifest/lists.sql", ResultShape.Rows);
    }
}

// Move It's entry writes (move-it.md §14, §20, §29), run one at a time or several in one transaction.
public class EntrySqlCommandInitializer : SqlCommandInitializer
{
    public EntrySqlCommandInitializer()
    {
        const SqlDbType S = SqlDbType.NVarChar, I = SqlDbType.Int;
        Script("entry.release-upsert", "manifest/release-upsert.sql", ResultShape.Rows,
            ("ApplicationId", I), ("Name", S), ("Kind", S), ("TargetDate", SqlDbType.Date), ("Note", S), ("By", S));
        Script("entry.build-upsert", "manifest/build-upsert.sql", ResultShape.Rows, ("ReleaseId", I), ("Build", S), ("Note", S), ("By", S));
        Script("entry.workitem-upsert", "manifest/workitem-upsert.sql", ResultShape.Rows,
            ("ApplicationId", I), ("ReleaseId", I), ("Kind", S), ("Title", S), ("Description", S), ("BuiltBy", S), ("ExternalRef", S),
            ("IncludedInBuild", S), ("FoundInStage", S), ("RemovedAt", SqlDbType.DateTimeOffset), ("RemovedNote", S), ("By", S));
        Script("entry.workitem-schedule", "manifest/workitem-schedule.sql", ResultShape.Rows, ("Id", I), ("ApplicationId", I), ("ReleaseId", I));
        Script("entry.workitem-attach", "manifest/workitem-attach.sql", ResultShape.Rows, ("Id", I), ("ReleaseId", I), ("Build", S));
        Script("entry.workitem-add", "manifest/workitem-add.sql", ResultShape.Rows, ("ApplicationId", I), ("Kind", S), ("Title", S), ("Description", S), ("By", S));
        Script("entry.event-insert", "manifest/event-insert.sql", ResultShape.Rows,
            ("ReleaseId", I), ("Kind", S), ("Stage", S), ("Build", S), ("At", SqlDbType.DateTimeOffset), ("EventBy", S), ("Note", S), ("By", S));
        Script("entry.workitem-pull", "manifest/workitem-pull.sql", ResultShape.Rows, ("Id", I), ("Note", S));
        Script("entry.workitem-retitle", "manifest/workitem-retitle.sql", ResultShape.Rows, ("Id", I), ("Title", S));
        Script("entry.build-release", "manifest/build-release.sql", ResultShape.Rows, ("ReleaseId", I), ("Build", S));
        Script("entry.release-delete", "manifest/release-delete.sql", ResultShape.Rows, ("Id", I));
    }
}

// The curate pages (personas.md §6.3): every asserted row read as stored, and corrected with its audit row.
public class EditSqlCommandInitializer : SqlCommandInitializer
{
    public EditSqlCommandInitializer()
    {
        const SqlDbType S = SqlDbType.NVarChar, I = SqlDbType.Int;
        (string, SqlDbType) actor = ("Actor", S), impersonatedBy = ("ImpersonatedBy", S);
        foreach (var name in new[] { "releases", "workitems", "builds", "events", "links", "audit-recent" })
        {
            Script($"edit.{name}", $"edit/{name}.sql", ResultShape.Rows);
        }
        Script("edit.audit", "edit/audit.sql", ResultShape.Rows, ("ReleaseId", I));
        Script("edit.release-save", "edit/release-save.sql", ResultShape.Scalar,
            ("Id", I), ("ApplicationId", I), ("Name", S), ("Kind", S), ("TargetDate", SqlDbType.Date), ("Note", S), actor, impersonatedBy);
        Script("edit.workitem-save", "edit/workitem-save.sql", ResultShape.Scalar,
            ("Id", I), ("ApplicationId", I), ("ReleaseId", I), ("Kind", S), ("Title", S), ("Description", S), ("BuiltBy", S), ("ExternalRef", S),
            ("IncludedInBuild", S), ("FoundInStage", S), ("RemovedAt", SqlDbType.DateTimeOffset), ("RemovedNote", S), actor, impersonatedBy);
        Script("edit.build-save", "edit/build-save.sql", ResultShape.Scalar, ("Id", I), ("ReleaseId", I), ("Build", S), ("Note", S), actor, impersonatedBy);
        Script("edit.event-save", "edit/event-save.sql", ResultShape.Scalar,
            ("Id", I), ("ReleaseId", I), ("Kind", S), ("Stage", S), ("Build", S), ("At", SqlDbType.DateTimeOffset), ("EventBy", S), ("Note", S), actor, impersonatedBy);
        Script("edit.link-save", "edit/link-save.sql", ResultShape.Scalar,
            ("Id", I), ("WorkItemId", I), ("LinkedWorkItemId", I), ("Kind", S), ("Note", S), actor, impersonatedBy);
        Script("edit.release-delete", "edit/release-delete.sql", ResultShape.Scalar, ("Id", I), actor, impersonatedBy);
        Script("edit.workitem-delete", "edit/workitem-delete.sql", ResultShape.Scalar, ("Id", I), actor, impersonatedBy);
        Script("edit.row-delete", "edit/row-delete.sql", ResultShape.Scalar, ("Entity", SqlDbType.VarChar), ("Id", I), actor, impersonatedBy);
    }
}

// Membership (personas.md §6.2) and the role list feature access offers (§6.1).
public class MembershipSqlCommandInitializer : SqlCommandInitializer
{
    public MembershipSqlCommandInitializer()
    {
        const SqlDbType S = SqlDbType.NVarChar, I = SqlDbType.Int;
        (string, SqlDbType) actor = ("Actor", S), impersonatedBy = ("ImpersonatedBy", S);
        Script("membership.members", "membership/members.sql", ResultShape.Rows);
        Script("membership.applications", "membership/applications.sql", ResultShape.Rows);
        Script("membership.roles", "fm/roles.sql", ResultShape.Rows);
        Script("membership.admin-applications", "membership/admin-applications.sql", ResultShape.Rows);
        Script("membership.admin-lists", "membership/admin-lists.sql", ResultShape.Rows);
        Script("membership.admin-app-parts", "membership/admin-app-parts.sql", ResultShape.Rows);
        Script("membership.admin-audit-recent", "membership/admin-audit-recent.sql", ResultShape.Rows);
        Script("membership.admin-audit", "membership/admin-audit.sql", ResultShape.Rows, ("Entity", SqlDbType.VarChar), ("Id", I));
        Script("membership.application-save", "membership/application-save.sql", ResultShape.Scalar,
            ("Id", I), ("Identifier", S), ("Name", S), ("Tags", S), ("Disposition", S), ("ApplicationTypeId", I), ("Settings", S), actor, impersonatedBy);
        Script("membership.member-save", "membership/member-save.sql", ResultShape.Scalar,
            ("Id", I), ("Identifier", S), ("WindowsIdentity", S), ("FirstName", S), ("LastName", S), ("Email", S), actor, impersonatedBy);
        Script("membership.grant-save", "membership/grant-save.sql", ResultShape.Scalar,
            ("MemberId", I), ("ApplicationId", I), ("RoleId", I), ("Revoke", SqlDbType.Bit), actor, impersonatedBy);
        Script("membership.application-delete", "membership/application-delete.sql", ResultShape.Scalar, ("Id", I), actor, impersonatedBy);
        Script("membership.member-delete", "membership/member-delete.sql", ResultShape.Scalar, ("Id", I), actor, impersonatedBy);
        Script("membership.app-part-save", "membership/app-part-save.sql", ResultShape.Scalar,
            ("Part", SqlDbType.VarChar), ("ApplicationId", I), ("OldKey", I), ("RoleId", I), ("Alias", S), ("StageId", I), ("Name", S),
            ("ServiceTypeId", I), ("StartOn", SqlDbType.Date), ("Status", S), actor, impersonatedBy);
        Script("membership.app-part-delete", "membership/app-part-delete.sql", ResultShape.Scalar,
            ("Part", SqlDbType.VarChar), ("ApplicationId", I), ("PartKey", I), actor, impersonatedBy);
    }
}

// The reset (census-on-apptrak.md §5).
public class ResetSqlCommandInitializer : SqlCommandInitializer
{
    public ResetSqlCommandInitializer()
    {
        const SqlDbType S = SqlDbType.NVarChar;
        Script("reset.armed", "reset/armed.sql", ResultShape.Rows);
        Script("reset.tables", "reset/tables.sql", ResultShape.Rows);
        Script("reset.resets", "reset/resets.sql", ResultShape.Rows);
        Script("reset.reset", "reset/reset-assertions.sql", ResultShape.Scalar, ("Reason", S), ("Actor", S), ("ImpersonatedBy", S));
        Script("reset.restore", "reset/restore-assertions.sql", ResultShape.Scalar, ("ResetId", SqlDbType.Int), ("Actor", S), ("ImpersonatedBy", S));
    }
}

// The log tables: Log Explorer, Trace, Usage (log-explorer-and-trace.md, usage.md). Read through LogsQueryHandler.
public class LogsSqlCommandInitializer : SqlCommandInitializer
{
    public LogsSqlCommandInitializer()
    {
        const SqlDbType S = SqlDbType.NVarChar, I = SqlDbType.Int, T = SqlDbType.DateTimeOffset, B = SqlDbType.Bit;
        Script("logs.facets", "logs/facets.sql", ResultShape.Rows,
            ("Schema", S), ("Table", S), ("Start", T), ("End", T), ("Columns", S), ("OffsetMinutes", I), ("HideHandshake", B));
        Script("logs.search", "logs/search.sql", ResultShape.Rows,
            ("Schema", S), ("Table", S), ("Start", T), ("End", T), ("Filters", S), ("Operator", S), ("HideHandshake", B), ("Writes", B),
            ("Refused", B), ("MinElapsed", I), ("SortColumn", S), ("SortDescending", B), ("PageIndex", I), ("PageSize", I));
        Script("trace.people", "logs/trace-people.sql", ResultShape.Rows, ("Schema", S), ("From", T), ("To", T));
        Script("trace.day", "logs/trace-day.sql", ResultShape.Rows, ("Schema", S), ("Identifier", S), ("From", T), ("To", T));
        Script("trace.month", "logs/trace-month.sql", ResultShape.Rows, ("Schema", S), ("Identifier", S), ("From", T), ("To", T), ("OffsetMinutes", I));
        Script("trace.session", "logs/trace-session.sql", ResultShape.Rows, ("Schema", S), ("SessionId", S), ("Max", I));
        Script("usage.applications", "logs/usage-applications.sql", ResultShape.Rows, ("Schema", S), ("From", T), ("To", T));
        Script("usage.summary", "logs/usage-summary.sql", ResultShape.Rows, ("Schema", S), ("Stage", S), ("From", T), ("To", T), ("EndedWithinMinutes", I));
        (string, SqlDbType)[] scope = [("Schema", S), ("Application", S), ("Stage", S), ("From", T), ("To", T), ("OffsetMinutes", I), ("SlowMs", I)];
        foreach (var section in new[] { "overview", "pages", "people", "when" })
        {
            Script($"usage.{section}", $"logs/usage-{section}.sql", ResultShape.Rows, scope);
        }
        Script("usage.page", "logs/usage-page.sql", ResultShape.Rows, [.. scope, ("Page", S)]);
        Script("usage.paths", "logs/usage-paths.sql", ResultShape.Rows, [.. scope, ("Cap", I)]);
        Script("usage.friction", "logs/usage-friction.sql", ResultShape.Rows,
            [.. scope, ("EndedWithinMinutes", I), ("RefusedTimes", I), ("LoopLoads", I), ("LoopSeconds", I), ("RetrySeconds", I),
             ("SlowMinRequests", I), ("DeadEndFactor", SqlDbType.Float), ("DeadEndMinRate", SqlDbType.Float), ("DeadEndMinViews", I)]);
    }
}
