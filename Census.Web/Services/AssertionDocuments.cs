using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Census.Web.CommandQuery;
using Census.Web.Identity;
using Census.Web.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// Census's own assertion layer, in AppTrak or in its files (census-on-apptrak.md §6, D-002). Each config document is
// kept as rows of census.Assertion: one row per unit a person asserts (a tagged entity, a system, a baseline), keyed by
// its path in the document, its value the unit's JSON, and a root row for the rest (version, the containers). The rows
// reassemble the document exactly, in order, so every store reads and writes the same JSON it always did and nothing
// above the stores changes. Every changed row is audited (census.AssertionAudit, PreviousValue / NewValue).
//
// A document lives in the database once it is listed in Census:AssertionsInDatabase and AppTrak is configured;
// otherwise in its file, as before (the demo profile, which has no AppTrak, stays on files). A document moved to the
// database is filled from its file only when asked (Import), never on its own: a reset must stay empty.
public class AssertionDocuments(
    JsonQueryHandler queries,
    JsonCommandHandler commands,
    IHttpContextAccessor http,
    IConfiguration configuration,
    IOptions<CensusOptions> census,
    IHostEnvironment env)
{
    // machines.json is not here: it is the collector's input (Invoke-Census.ps1 reads it on a box with no AppTrak), so it
    // stays a file.
    // Each document, the setting naming its file, and where its units are: "a.*.*" is every property two levels under
    // a; "a[]:id" is every element of the array a, keyed by its id (several key properties joined with "|").
    public static readonly IReadOnlyDictionary<string, (Func<CensusOptions, string> File, string[] Units)> Documents =
        new Dictionary<string, (Func<CensusOptions, string>, string[])>(StringComparer.OrdinalIgnoreCase)
        {
            ["entity-tags"] = (o => o.EntityTagsConfigPath, ["databases.*.*.*", "applications.*.*.*"]),
            ["systems"] = (o => o.SystemsConfigPath, ["systems.*"]),
            ["stage-crossings"] = (o => o.StageCrossingsConfigPath, ["accepted[]:caller|target"]),
            ["declared-entities"] = (o => o.DeclaredEntitiesConfigPath, ["onMachines.*.*", "external.*"]),
            ["assets"] = (o => o.AssetsConfigPath, ["assets.*"]),
            ["baselines"] = (o => o.BaselinesConfigPath, ["baselines[]:id"]),
            ["blacklist"] = (o => o.BlacklistConfigPath, ["rules[]:id"]),
            ["views"] = (o => o.ViewsConfigPath, ["views[]:id"]),
        };

    private const string Root = "[]";

    private static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static readonly JsonSerializerOptions Compact = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public bool InDatabase(string document) =>
        queries.Enabled && (configuration.GetSection("Census:AssertionsInDatabase").Get<string[]>() ?? []).Contains(document, StringComparer.OrdinalIgnoreCase);

    public string FilePath(string document) =>
        Path.GetFullPath(Path.Combine(env.ContentRootPath, Documents[document].File(census.Value)));

    // The document's JSON as its store reads it; null when there is none (no file, or no rows).
    public string Read(string document)
    {
        if (!InDatabase(document))
        {
            var path = FilePath(document);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }
        var rows = queries.Query(CommandQuery.ResponseExtensions.Key("assertion.read", ("Document", document.ToLowerInvariant()))).Rows();
        return rows.Count == 0 ? null : Assemble(rows.Select(r => ((string)r["EntityKey"], (string)r["Value"]))).ToJsonString(Pretty);
    }

    // The document as its store writes it: the file, or the rows that changed, audited, as the signed-in actor.
    public WriteResult Write(string document, string json)
    {
        if (!InDatabase(document))
        {
            File.WriteAllText(FilePath(document), json);
            return new WriteResult { Status = 200 };
        }
        return Save(document, json);
    }

    // Moves a document's file into its rows (an audited save like any other). For a document in the database only.
    public WriteResult Import(string document)
    {
        var path = FilePath(document);
        if (!File.Exists(path)) return new WriteResult { Status = 404, Message = $"No file at {path}." };
        return Save(document, File.ReadAllText(path));
    }

    // Each document held in the database, with its rows and when it last changed.
    public List<Dictionary<string, object>> Counts() => queries.Query(CommandQuery.ResponseExtensions.Key("assertion.counts")).Rows();

    private WriteResult Save(string document, string json)
    {
        var units = Split(document, JsonNode.Parse(json, documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true })!.AsObject());
        // A unit that means what its row already holds keeps the row's text, so property order or spacing is no change.
        var held = queries.Query(CommandQuery.ResponseExtensions.Key("assertion.read", ("Document", document.ToLowerInvariant()))).Rows()
            .ToDictionary(r => (string)r["EntityKey"], r => (string)r["Value"]);
        units = units.Select(u => held.TryGetValue(u.Key, out var was) && JsonNode.DeepEquals(JsonNode.Parse(was), JsonNode.Parse(u.Value)) ? (u.Key, was) : u).ToList();
        var rows = new JsonArray(units.Select((u, i) => (JsonNode)new JsonObject { ["key"] = u.Key, ["sort"] = i, ["value"] = u.Value }).ToArray());
        var actor = http.HttpContext?.User.Actor() ?? new Actor("census", null);
        return commands.ExecuteAsync(CommandQuery.ResponseExtensions.Key("assertion.save", ("Document", document.ToLowerInvariant()), ("Rows", rows.ToJsonString())).By(actor), null)
            .GetAwaiter().GetResult().ToWriteResult();
    }

    // ---- the document ↔ rows mapping

    public static List<(string Key, string Value)> Split(string document, JsonObject root)
    {
        var units = new List<(string, string)>();
        foreach (var rule in Documents[document].Units)
        {
            var (path, keyProps) = Parse(rule);
            Collect(root, path, 0, [], keyProps, units);
        }
        return [(Root, root.ToJsonString(Compact)), .. units];
    }

    public static JsonObject Assemble(IEnumerable<(string Key, string Value)> rows)
    {
        var ordered = rows.ToList();
        var root = ordered.FirstOrDefault(r => r.Key == Root).Value is string r0 ? JsonNode.Parse(r0)!.AsObject() : new JsonObject();
        foreach (var (key, value) in ordered.Where(r => r.Key != Root))
        {
            var segments = JsonSerializer.Deserialize<string[]>(key)!;
            JsonNode node = root;
            for (var i = 0; i < segments.Length - 1; i++)
            {
                var segment = segments[i];
                if (segment.EndsWith("[]"))
                {
                    var name = segment[..^2];
                    var array = node[name] as JsonArray;
                    if (array == null) node[name] = array = new JsonArray();
                    array.Add(JsonNode.Parse(value));
                    node = null;
                    break;
                }
                node = node[segment] ?? (node[segment] = new JsonObject());
            }
            if (node != null) node[segments[^1]] = JsonNode.Parse(value);
        }
        return root;
    }

    private static (string[] Path, string[] KeyProps) Parse(string rule)
    {
        var colon = rule.IndexOf(':');
        var path = (colon < 0 ? rule : rule[..colon]).Split('.');
        return (path, colon < 0 ? null : rule[(colon + 1)..].Split('|'));
    }

    // Walks the rule's path; at its end, takes each unit out of the document (the root keeps its emptied container).
    private static void Collect(JsonNode node, string[] path, int depth, List<string> segments, string[] keyProps, List<(string, string)> units)
    {
        if (node is not JsonObject obj) return;
        var segment = path[depth];
        var last = depth == path.Length - 1;
        if (segment.EndsWith("[]"))
        {
            if (obj[segment[..^2]] is not JsonArray array) return;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var element in array.ToList())
            {
                var id = string.Join("|", keyProps.Select(p => element?[p]?.ToString() ?? ""));
                // Two elements with one key (a list the file never policed) stay two rows.
                for (var n = 2; !seen.Add(id); n++) id = $"{id.Split('#')[0]}#{n}";
                units.Add((JsonSerializer.Serialize<string[]>([.. segments, segment, id]), element!.ToJsonString(Compact)));
                array.Remove(element);
            }
            return;
        }
        var names = segment == "*" ? obj.Select(p => p.Key).ToList() : obj.ContainsKey(segment) ? [segment] : [];
        foreach (var name in names)
        {
            if (last)
            {
                units.Add((JsonSerializer.Serialize<string[]>([.. segments, name]), obj[name]?.ToJsonString(Compact) ?? "null"));
                obj.Remove(name);
            }
            else
            {
                Collect(obj[name], path, depth + 1, [.. segments, name], keyProps, units);
            }
        }
    }
}
