using System.Collections.Generic;
using System.Linq;

namespace Gatehouse.CommandQuery;

public class ResponseStatus
{
    public string Id { get; set; }
    public int HttpCode { get; set; } = 200;
    public string Message { get; set; }
    public string SystemMessage { get; set; }
    public string StackTrace { get; set; }
    public int Affected { get; set; }
}

public class Response
{
    public string Action { get; set; }
    public bool IsOkay => Status?.HttpCode == 200;
    public ResponseStatus Status { get; set; } = new();
}

public class Response<T> : Response
{
    public List<T> Items { get; set; } = new();

    public T Model
    {
        get => Items.Any() ? Items.First() : default;
        set => Items.Add(value);
    }
}
