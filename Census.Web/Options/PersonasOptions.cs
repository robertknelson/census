namespace Census.Web.Options;

// The persona UX (personas.md). Membership is read from AppTrak through MoveIt:ConnectionString;
// absent, the persona API is not mounted. Feature grants are AppTrak's fm schema (§6.1).
public class PersonasOptions
{
    public const string SectionName = "Personas";

    // The membership.Application whose roles are estate-wide (§4). Assumed "census" until read
    // from the real database (open item P6).
    public string EstateApplication { get; set; } = "census";

    // The period view's fiscal year starts on the first of this month (1-12); quarters count
    // from it. January until Robert names the real one (open item P5).
    public int FiscalYearStartMonth { get; set; } = 1;
}
