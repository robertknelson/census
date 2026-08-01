namespace Census.Web.Options;

public class CensusOptions
{
    public const string SectionName = "Census";

    public required string RootPath { get; set; }
    public required string MachinesConfigPath { get; set; }
    public required string BlacklistConfigPath { get; set; }
    public required string AssetsConfigPath { get; set; }
}
