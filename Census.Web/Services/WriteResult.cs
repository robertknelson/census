namespace Census.Web.Services;

// A write's answer as the controllers return it: 200 with its key, or the refusal the script THREW (400, 404, 409) in its
// own words. Made from a command's response by ResponseExtensions.ToWriteResult (census-on-apptrak.md §3).
public class WriteResult
{
    public int Status { get; init; }
    public string Key { get; init; }
    public string Message { get; init; }

    // For a store whose callers expect a save to happen or throw, as a file write did.
    public void EnsureSaved()
    {
        if (Status != 200) throw new System.InvalidOperationException(Message ?? $"The save was refused ({Status}).");
    }
}
