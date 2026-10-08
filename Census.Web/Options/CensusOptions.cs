using System.Collections.Generic;

namespace Census.Web.Options;

public class CensusOptions
{
    public const string SectionName = "Census";

    public required string RootPath { get; set; }
    public required string MachinesConfigPath { get; set; }
    public required string BlacklistConfigPath { get; set; }
    public required string AssetsConfigPath { get; set; }
    public required string BaselinesConfigPath { get; set; }
    public required string EntityTagsConfigPath { get; set; }
    public required string DeclaredEntitiesConfigPath { get; set; }
    public required string SystemsConfigPath { get; set; }
    public required string ViewsConfigPath { get; set; }
    public required string StageCrossingsConfigPath { get; set; }

    /// <summary>The order stages are listed in (census-web.md §14); unnamed stages follow, alphabetically.</summary>
    public List<string> StageOrder { get; set; } = [];
}
