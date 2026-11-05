using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// The reset (census-on-apptrak.md §5, D-003): wipes every asserted row in AppTrak and keeps each as
// JSON so the wipe can be undone. Two keys, both on the server: the setting Reset:Allowed (absent,
// false; never set in production) and the database's own AllowAssertionReset property, which the
// scripts check themselves. Only a system administrator on Census may see it offered or use it.
public class AssertionReset
{
    public const string AdminRole = "system-administrator";

    private readonly ScriptRunner _scripts;
    private readonly MemberAccess _access;
    private readonly bool _setting;

    public AssertionReset(IOptions<MoveItOptions> options, IWebHostEnvironment env, IConfiguration configuration, MemberAccess access)
    {
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath)), options.Value.ConnectionString);
        _access = access;
        _setting = configuration.GetValue<bool>("Reset:Allowed");
    }

    public bool Enabled => _scripts.Enabled;

    public async Task<bool> IsAdminAsync(string actor) =>
        (await _access.AccessAsync(actor))?.EstateRoles.Contains(AdminRole, StringComparer.OrdinalIgnoreCase) == true;

    public async Task<ResetStatus> StatusAsync(string actor)
    {
        var admin = await IsAdminAsync(actor);
        var armed = (bool)(await _scripts.ReadAsync("reset/armed.sql"))[0]["Armed"];
        var why = new List<string>();
        if (!admin) why.Add("Only a system administrator on Census may reset.");
        if (!_setting) why.Add("This Census is not allowed to reset: the setting Reset:Allowed is off.");
        if (!armed) why.Add("This database is not armed for a reset (apptrak/sql/reset/002-arm-reset.sql, by hand, never on production).");

        var tables = await _scripts.ReadAsync("reset/tables.sql");
        var resets = await _scripts.ReadAsync("reset/resets.sql");
        return new ResetStatus
        {
            Allowed = why.Count == 0,
            Why = why,
            Tables = tables.Select(t => new ResetTable { Table = (string)t["TableName"], Note = t["Note"] as string, RowsNow = t["RowsNow"] as int? }).ToList(),
            Resets = resets.Select(r => new ResetEntry
            {
                ResetId = (int)r["ResetId"],
                At = (DateTimeOffset)r["At"],
                By = (string)r["By"],
                Reason = (string)r["Reason"],
                RestoredAt = r["RestoredAt"] as DateTimeOffset?,
                RestoredBy = r["RestoredBy"] as string,
                RowsTaken = (int)r["RowsTaken"],
            }).ToList(),
        };
    }

    // The setting is the app's key; the role is checked by the caller. The database's key is the script's.
    public bool SettingAllows => _setting;

    public Task<WriteResult> ResetAsync(string reason, string actor) =>
        _scripts.WriteAsync("reset/reset-assertions.sql", actor, ("Reason", reason, SqlDbType.NVarChar));

    public Task<WriteResult> RestoreAsync(int resetId, string actor) =>
        _scripts.WriteAsync("reset/restore-assertions.sql", actor, ("ResetId", resetId, SqlDbType.Int));
}

public class ResetStatus
{
    public bool Allowed { get; init; }
    public List<string> Why { get; init; }
    public List<ResetTable> Tables { get; init; }
    public List<ResetEntry> Resets { get; init; }
}

public class ResetTable
{
    public string Table { get; init; }
    public string Note { get; init; }
    public int? RowsNow { get; init; }
}

public class ResetEntry
{
    public int ResetId { get; init; }
    public DateTimeOffset At { get; init; }
    public string By { get; init; }
    public string Reason { get; init; }
    public DateTimeOffset? RestoredAt { get; init; }
    public string RestoredBy { get; init; }
    public int RowsTaken { get; init; }
}

public class ResetRequest
{
    public string Confirm { get; init; }
    public string Reason { get; init; }
}
