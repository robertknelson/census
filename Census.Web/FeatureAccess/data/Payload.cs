using System.Collections.Generic;
using System.Text.Json.Nodes;

namespace Census.Web.FeatureAccess.Data
{
    // Reads command payloads (user input) and collects every validation error rather than stopping at the first.
    internal sealed class Payload
    {
        private readonly JsonObject _data;

        public Payload(JsonNode data)
        {
            _data = data as JsonObject;
            if (_data == null)
            {
                Errors.Add("The request body must be a JSON object.");
            }
        }

        public List<string> Errors { get; } = new();

        public string String(string name, int maxLength, bool required)
        {
            var node = _data?[name];
            if (node == null)
            {
                if (required) Errors.Add($"'{name}' is required.");
                return null;
            }
            if (node is not JsonValue value || !value.TryGetValue(out string text))
            {
                Errors.Add($"'{name}' must be a string.");
                return null;
            }

            text = text.Trim();
            if (text.Length == 0)
            {
                if (required) Errors.Add($"'{name}' is required.");
                return null;
            }
            if (text.Length > maxLength)
            {
                Errors.Add($"'{name}' must be {maxLength} characters or fewer.");
            }
            return text;
        }

        public bool Bool(string name, bool required)
        {
            var node = _data?[name];
            if (node == null)
            {
                if (required) Errors.Add($"'{name}' is required.");
                return false;
            }
            if (node is JsonValue value && value.TryGetValue(out bool flag))
            {
                return flag;
            }
            Errors.Add($"'{name}' must be true or false.");
            return false;
        }

        public long RowVersion()
        {
            if (_data?["rowVersion"] is JsonValue value && value.TryGetValue(out string text) && long.TryParse(text, out var rowVersion))
            {
                return rowVersion;
            }
            Errors.Add("'rowVersion' is required (the value from the feature you loaded).");
            return 0;
        }

        public List<string> Strings(string name)
        {
            var items = new List<string>();
            var node = _data?[name];
            if (node == null)
            {
                return items;
            }
            if (node is not JsonArray array)
            {
                Errors.Add($"'{name}' must be an array of strings.");
                return items;
            }
            foreach (var item in array)
            {
                if (item is JsonValue value && value.TryGetValue(out string text) && text.Trim().Length > 0)
                {
                    items.Add(text.Trim());
                }
                else
                {
                    Errors.Add($"'{name}' must contain only non-empty strings.");
                }
            }
            return items;
        }
    }
}
