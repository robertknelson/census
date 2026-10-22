using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Data
{
    // Every FM2280 script ends by selecting one JSON value (one row, one column).
    internal static class SqlJson
    {
        public static async Task<string> ExecuteAsync(string connectionString, string scriptName, IEnumerable<SqlParameter> parameters)
        {
            await using var connection = new SqlConnection(connectionString);
            await using var command = new SqlCommand(SqlScripts.Load(scriptName), connection);
            command.Parameters.AddRange(parameters.ToArray());
            await connection.OpenAsync();
            return await command.ExecuteScalarAsync() as string;
        }

        public static SqlParameter Parameter(string name, SqlDbType type, object value, int size = 0) =>
            new(name, type, size) { Value = value ?? DBNull.Value };
    }
}
