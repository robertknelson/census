using System.Collections.Concurrent;
using System.IO;
using System.Reflection;

namespace Gatehouse.CommandQuery;

// Loads a script embedded in the assembly by its path in the project: "feature-management/sql/feature-list.sql".
public static class SqlScript
{
    private static readonly ConcurrentDictionary<string, string> Loaded = new();

    public static string Load(string path) => Loaded.GetOrAdd(path, key =>
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(key)
            ?? throw new FileNotFoundException($"No embedded script '{key}'.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });
}
