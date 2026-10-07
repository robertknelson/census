using System.Collections.Generic;

namespace Census.Web.Options;

// The board (move-it.md §13) is the first Census code that reads SQL. ConnectionString is
// optional: absent, the module is not mounted and the rest of Census runs file-only as before.
// By is the name written as CreatedBy by the entry page (§15) until AppTrak's identity is in
// reach (open item 10); absent, "census-board".
public class MoveItOptions
{
    public const string SectionName = "MoveIt";

    public string ConnectionString { get; set; }
    public required string SqlPath { get; set; }
    public string By { get; set; }

    // The board's release view (§18) folds a release into "shipped" once it has been wholly
    // in the top stage this many days.
    public int ShippedDays { get; set; } = 14;

    // History's "needs a word from you" (§23): a release in flight this many days at its stage
    // with nothing recorded, and a heard item this many days with no release, are asked about.
    public int StaleDays { get; set; } = 14;
    public int ComingDays { get; set; } = 60;

    // The registers (§28) page at this many rows.
    public int PageSize { get; set; } = 50;

    // Division (§19) puts a plain-words caption under each stage's step, keyed by stage
    // identifier. A stage with no caption shows its name alone.
    public Dictionary<string, string> StepCaptions { get; set; } = new()
    {
        ["DEV"] = "developer testing",
        ["VAL"] = "validation testing",
        ["UAT"] = "user acceptance testing",
        ["PROD"] = "live",
    };
}
