using System.Collections.Generic;

namespace Census.Web.CommandQuery;

// The dispatch bag: the command key, route values and the current user. The model payload travels as a JsonNode.
public class Parameters : Dictionary<string, object>, IParameters
{
    public Parameters() : base(System.StringComparer.OrdinalIgnoreCase)
    {
    }

    public IParameters AddParam(string key, object value)
    {
        this[key] = value;
        return this;
    }

    // A value of the asked type that is present and not blank. (xf-dashboard's answered differently for the
    // lower-cased key; one rule here, and keys are case-insensitive.)
    public bool TryGet<T>(string key, out T value)
    {
        value = default;
        if (!TryGetValue(key, out var obj) || obj is not T typed) return false;
        value = typed;
        return !string.IsNullOrWhiteSpace(typed?.ToString());
    }
}
