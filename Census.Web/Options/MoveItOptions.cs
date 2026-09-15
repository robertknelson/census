namespace Census.Web.Options;

// The board (move-it.md §13) is the first Census code that reads SQL. ConnectionString is
// optional: absent, the module is not mounted and the rest of Census runs file-only as before.
public class MoveItOptions
{
    public const string SectionName = "MoveIt";

    public string ConnectionString { get; set; }
    public required string SqlPath { get; set; }
}
