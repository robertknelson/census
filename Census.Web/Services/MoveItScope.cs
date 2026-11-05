using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
using Census.Web.Identity;

namespace Census.Web.Services;

// Who may see and change which Move It rows (census-on-apptrak.md §7, D-004, CA-1), decided on the server for the member
// acted as. Reads: the applications the member holds a role on, every one for an estate-wide role. Writes: the curate
// feature for that kind of row, held on that row's application. Feature access's grants are the authority, so roles,
// membership and fm stay one picture (D-002).
//
// A system administrator, signed in as themselves, sees and changes everything; impersonating, they get exactly the
// member's scope, so what they see is what that member sees (§10).
//
// Each read key declares how its rows reach an application (an ApplicationId column, a ReleaseId, a WorkItemId, the
// audit's entity, or application names); a row that reaches none is left out. An estate-wide member's answers are
// returned untouched.
public class MoveItScope(MemberAccess members, JsonQueryHandler queries)
{
    public static readonly string Releases = "curate.releases";
    public static readonly string Items = "curate.feature-sets";
    public static readonly string Associations = "curate.associations";
    public static readonly string Events = "curate.events";

    private enum By { None, Application, Release, WorkItem, Audit, ApplicationNames }

    private static readonly Dictionary<string, By> Keys = new(StringComparer.OrdinalIgnoreCase)
    {
        ["board.stages"] = By.None,
        ["moveit.lists"] = By.None,
        ["board.applications"] = By.Application,
        ["board.releases"] = By.Application,
        ["board.history"] = By.Application,
        ["board.builds-seen"] = By.Application,
        ["board.coverage"] = By.Application,
        ["board.calendar"] = By.Application,
        ["board.events"] = By.Release,
        ["board.release-builds"] = By.Release,
        ["board.release-build-history"] = By.Release,
        ["question.01-where-is-everything"] = By.Application,
        ["question.02-release-status"] = By.Application,
        ["question.04-ready-to-approve"] = By.Application,
        ["question.06-stage-mismatch"] = By.Application,
        ["question.09-lead-time"] = By.Application,
        ["question.12-approval-vs-prod"] = By.Application,
        ["question.03-order-violations"] = By.ApplicationNames,
        ["edit.releases"] = By.Application,
        ["edit.workitems"] = By.Application,
        ["edit.builds"] = By.Release,
        ["edit.events"] = By.Release,
        ["edit.links"] = By.WorkItem,
        ["edit.audit-recent"] = By.Audit,
    };

    public async Task<Reader> ForAsync(ClaimsPrincipal user)
    {
        if (user.CanAdminister() && !user.IsImpersonating()) return new Reader(null, queries, administrator: true);
        var access = members.Enabled ? await members.AccessAsync(user.Effective()) : null;
        return new Reader(access, queries, administrator: false);
    }

    public class Reader
    {
        private readonly MemberAccessResult _access;
        private readonly JsonQueryHandler _queries;
        private readonly bool _administrator;
        private Dictionary<int, int> _releaseApp;
        private Dictionary<int, int> _itemApp;
        private Dictionary<int, int> _buildRelease;
        private Dictionary<int, int> _eventRelease;
        private Dictionary<int, int> _linkItem;

        public Reader(MemberAccessResult access, JsonQueryHandler queries, bool administrator)
        {
            _access = access;
            _queries = queries;
            _administrator = administrator;
        }

        // An estate-wide role sees every application, so its answers are not trimmed.
        public bool All => _administrator || _access?.Estate == true;

        public bool Sees(int applicationId) => All || (_access?.Applications.Any(a => a.ApplicationId == applicationId) ?? false);

        public bool May(string feature, int applicationId) =>
            _administrator
            || (_access?.Estate == true && _access.EstateFeatures.Contains(feature))
            || (_access?.Applications.Any(a => a.ApplicationId == applicationId && a.Features.Contains(feature)) ?? false);

        // The applications on which each curate feature is held: what the Move It pages offer forms for.
        public Dictionary<string, object> Writes() => new[] { Releases, Items, Associations, Events }.ToDictionary(
            f => f,
            f => (object)(_administrator || _access?.Estate == true && _access.EstateFeatures.Contains(f)
                ? "all"
                : _access?.Applications.Where(a => a.Features.Contains(f)).Select(a => a.ApplicationId).ToList() ?? []));

        public async Task<List<Dictionary<string, object>>> TrimAsync(string key, List<Dictionary<string, object>> rows)
        {
            if (All) return rows;
            var by = Keys.TryGetValue(key, out var declared) ? declared : throw new InvalidOperationException($"{key} declares no scope.");
            if (by == By.None) return rows;
            var kept = new List<Dictionary<string, object>>();
            foreach (var row in rows)
            {
                if (await AppOfAsync(by, row) is int app && Sees(app)) kept.Add(row);
                else if (by == By.ApplicationNames && NamesSeen(row)) kept.Add(row);
            }
            return kept;
        }

        // The feature picture (§28): one document, an item per entry, each naming its application.
        public string TrimPicture(string json)
        {
            if (All || string.IsNullOrEmpty(json)) return json;
            var items = JsonNode.Parse(json) as JsonArray ?? [];
            var kept = new JsonArray();
            foreach (var item in items.ToList())
            {
                var id = item?["application"]?["id"]?.GetValue<int>();
                if (id is int app && Sees(app))
                {
                    items.Remove(item);
                    kept.Add(item);
                }
            }
            return kept.ToJsonString();
        }

        public async Task<int?> ReleaseAppAsync(int releaseId) => (await ReleaseApps()).TryGetValue(releaseId, out var a) ? a : null;

        public async Task<int?> ItemAppAsync(int itemId) => (await ItemApps()).TryGetValue(itemId, out var a) ? a : null;

        public async Task<int?> BuildAppAsync(int buildRowId) =>
            (_buildRelease ??= await Map("edit.builds", "ReleaseBuildId", "ReleaseId")).TryGetValue(buildRowId, out var r) ? await ReleaseAppAsync(r) : null;

        public async Task<int?> EventAppAsync(int eventId) =>
            (_eventRelease ??= await Map("edit.events", "EventId", "ReleaseId")).TryGetValue(eventId, out var r) ? await ReleaseAppAsync(r) : null;

        public async Task<int?> LinkAppAsync(int linkId) =>
            (_linkItem ??= await Map("edit.links", "LinkId", "WorkItemId")).TryGetValue(linkId, out var i) ? await ItemAppAsync(i) : null;

        private async Task<int?> AppOfAsync(By by, Dictionary<string, object> row) => by switch
        {
            By.Application => Int(row, "ApplicationId"),
            By.Release => Int(row, "ReleaseId") is int r ? await ReleaseAppAsync(r) : null,
            By.WorkItem => Int(row, "WorkItemId") is int i ? await ItemAppAsync(i) : null,
            By.Audit => Int(row, "ReleaseId") is int r ? await ReleaseAppAsync(r) : await AuditEntityAppAsync(row),
            _ => null,
        };

        // An audit row with no release: an item heard about, or a link, still present. A row deleted since reaches nothing.
        private async Task<int?> AuditEntityAppAsync(Dictionary<string, object> row) => (row["Entity"] as string, Int(row, "EntityId")) switch
        {
            ("workitem", int id) => await ItemAppAsync(id),
            ("link", int id) => await LinkAppAsync(id),
            _ => null,
        };

        private bool NamesSeen(Dictionary<string, object> row)
        {
            var names = _access?.Applications.Select(a => a.Name).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
            return row.TryGetValue("DependentApp", out var d) && d is string dn && names.Contains(dn)
                || row.TryGetValue("DependsOnApp", out var o) && o is string on && names.Contains(on);
        }

        private async Task<Dictionary<int, int>> ReleaseApps() => _releaseApp ??= await Map("edit.releases", "ReleaseId", "ApplicationId");

        private async Task<Dictionary<int, int>> ItemApps() => _itemApp ??= await Map("edit.workitems", "WorkItemId", "ApplicationId");

        private async Task<Dictionary<int, int>> Map(string key, string from, string to) =>
            (await _queries.QueryAsync(ResponseExtensions.Key(key))).Rows()
                .Where(r => Int(r, from) is int && Int(r, to) is int)
                .ToDictionary(r => Int(r, from).Value, r => Int(r, to).Value);

        private static int? Int(Dictionary<string, object> row, string column) =>
            row.TryGetValue(column, out var v) && v != null ? Convert.ToInt32(v) : null;
    }
}
