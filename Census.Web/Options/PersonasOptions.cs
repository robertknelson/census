namespace Census.Web.Options;

// The persona UX (personas.md). Membership is read from AppTrak through MoveIt:ConnectionString;
// absent, the persona API is not mounted. Feature grants are config/features.json (§6).
public class PersonasOptions
{
    public const string SectionName = "Personas";

    // The membership.Application whose roles are estate-wide (§4). Assumed "census" until read
    // from the real database (open item P6).
    public string EstateApplication { get; set; } = "census";

    public string FeaturesConfigPath { get; set; } = "../config/features.json";
}
