using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// Runs one of the Move It question files verbatim (move-it.md §10.2 rule 9: one read-only
// .sql per question, the board reads them). The files are the contract; C# never carries SQL.
// Rows come back as column-name → value so a new column in a file reaches the page unchanged.
public class MoveItQuestions
{
    private readonly string _sqlPath;
    private readonly string _connectionString;

    public MoveItQuestions(IOptions<MoveItOptions> options, IWebHostEnvironment env)
    {
        _sqlPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath));
        _connectionString = options.Value.ConnectionString;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_connectionString);

    public async Task<List<Dictionary<string, object>>> RunAsync(string relativeFile)
    {
        var sql = await File.ReadAllTextAsync(Path.Combine(_sqlPath, relativeFile));
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var rows = new List<Dictionary<string, object>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object>(reader.FieldCount);
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            rows.Add(row);
        }
        return rows;
    }

    // A question that ends FOR JSON PATH (13) comes back as one document in chunks, one per
    // row; this joins them. An empty result is an empty array, never an empty body.
    public async Task<string> RunJsonAsync(string relativeFile)
    {
        var sql = await File.ReadAllTextAsync(Path.Combine(_sqlPath, relativeFile));
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var json = new System.Text.StringBuilder();
        while (await reader.ReadAsync())
        {
            if (!reader.IsDBNull(0)) json.Append(reader.GetString(0));
        }
        return json.Length == 0 ? "[]" : json.ToString();
    }
}
